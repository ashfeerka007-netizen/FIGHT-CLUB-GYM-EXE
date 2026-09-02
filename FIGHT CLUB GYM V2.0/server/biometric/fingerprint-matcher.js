// ISO 19794-2:2005 & ANSI 378 Biometric Fingerprint Minutiae Matching Engine
// Fight Club Gym V2.0 — High-performance 1:1 and 1:N Template Matching

const db = require('../db');

/**
 * Parse an ISO 19794-2 / ANSI 378 binary minutiae template
 * @param {string} base64Str Base64-encoded ISO template string (FMR)
 * @returns {Object|null} Parsed template with header metrics and minutiae point array
 */
function parseIsoTemplate(base64Str) {
  if (!base64Str || typeof base64Str !== 'string') return null;
  const clean = base64Str.replace(/^data:.*?;base64,/, '').trim();
  if (!clean) return null;

  try {
    const buf = Buffer.from(clean, 'base64');
    if (buf.length < 28) return null;

    // Detect Header Type: ISO 19794-2 magic is "FMR\0 20\0"
    const magic = buf.subarray(0, 4).toString('ascii');
    let numMinutiae = 0;
    let offset = 28;

    if (magic === 'FMR\0' || buf.subarray(0, 4).toString('hex') === '464d5200') {
      numMinutiae = buf[27];
      offset = 28;
    } else {
      // ANSI 378 or other standard template format
      numMinutiae = buf[27] || buf[26] || buf[28] || 0;
      offset = 28;
    }

    const minutiae = [];
    for (let i = 0; i < numMinutiae && offset + 6 <= buf.length; i++) {
      const rawX = buf.readUInt16BE(offset);
      const type = (rawX >> 14) & 0x03; // 01: Ridge Ending, 10: Bifurcation, 00: Other
      const x = rawX & 0x3FFF;
      const rawY = buf.readUInt16BE(offset + 2);
      const y = rawY & 0x3FFF;
      const angle = buf[offset + 4]; // 0..255 maps to 0..360 degrees
      const quality = buf[offset + 5];

      minutiae.push({
        x,
        y,
        type,
        angleRad: (angle * 2 * Math.PI) / 256,
        angleDeg: Math.round((angle * 360) / 256),
        quality
      });
      offset += 6;
    }

    return {
      width: buf.readUInt16BE(14),
      height: buf.readUInt16BE(16),
      quality: buf[26] || 0,
      minutiaeCount: minutiae.length,
      minutiae
    };
  } catch (err) {
    return null;
  }
}

/**
 * 1:1 Minutiae Matching between Probe and Gallery ISO templates
 * Implements translation and rotation invariant coordinate alignment
 * 
 * @param {string} probeBase64 Scanned probe ISO template
 * @param {string} galleryBase64 Stored gallery ISO template
 * @param {Object} options Configurable tolerances and matching thresholds
 * @returns {{ match: boolean, score: number, matchedCount: number, probeCount: number, galleryCount: number }}
 */
function matchIso1to1(probeBase64, galleryBase64, options = {}) {
  const probe = parseIsoTemplate(probeBase64);
  const gallery = parseIsoTemplate(galleryBase64);

  if (!probe || !gallery || probe.minutiae.length === 0 || gallery.minutiae.length === 0) {
    return { match: false, score: 0, matchedCount: 0, probeCount: probe?.minutiae.length || 0, galleryCount: gallery?.minutiae.length || 0 };
  }

  const P = probe.minutiae;
  const G = gallery.minutiae;

  const distTolerance = options.distTolerance || 22; // pixel radius tolerance
  const angleTolerance = options.angleTolerance || (35 * Math.PI / 180); // 35 degrees tolerance
  const maxTwistRad = (options.maxRotationDeg || 70) * (Math.PI / 180);

  let maxMatched = 0;
  let bestScore = 0;

  // Align candidate minutiae pairs (P[i] to G[j])
  for (let i = 0; i < P.length; i++) {
    for (let j = 0; j < G.length; j++) {
      const pi = P[i];
      const gj = G[j];

      // Calculate relative orientation delta
      let dTheta = gj.angleRad - pi.angleRad;
      while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
      while (dTheta < -Math.PI) dTheta += 2 * Math.PI;

      if (Math.abs(dTheta) > maxTwistRad) continue;

      const cosT = Math.cos(dTheta);
      const sinT = Math.sin(dTheta);

      let matchedCount = 0;
      const gMatched = new Array(G.length).fill(false);

      for (let u = 0; u < P.length; u++) {
        const pu = P[u];

        // Transform pu relative to reference pi
        const rx = pu.x - pi.x;
        const ry = pu.y - pi.y;

        const rotX = rx * cosT - ry * sinT;
        const rotY = rx * sinT + ry * cosT;

        const mappedX = rotX + gj.x;
        const mappedY = rotY + gj.y;

        let mappedAngle = pu.angleRad + dTheta;
        while (mappedAngle > Math.PI) mappedAngle -= 2 * Math.PI;
        while (mappedAngle < -Math.PI) mappedAngle += 2 * Math.PI;

        let bestDist = Infinity;
        let bestIdx = -1;

        for (let v = 0; v < G.length; v++) {
          if (gMatched[v]) continue;
          const gv = G[v];

          const dx = mappedX - gv.x;
          const dy = mappedY - gv.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist <= distTolerance) {
            let adiff = Math.abs(mappedAngle - gv.angleRad);
            while (adiff > Math.PI) adiff = Math.abs(adiff - 2 * Math.PI);

            if (adiff <= angleTolerance) {
              if (dist < bestDist) {
                bestDist = dist;
                bestIdx = v;
              }
            }
          }
        }

        if (bestIdx >= 0) {
          gMatched[bestIdx] = true;
          matchedCount++;
        }
      }

      const denom = Math.min(P.length, G.length);
      const score = denom > 0 ? Math.round((matchedCount / denom) * 100) : 0;

      if (matchedCount > maxMatched) {
        maxMatched = matchedCount;
        bestScore = score;
      }
    }
  }

  const threshold = options.threshold !== undefined ? options.threshold : 32;
  const minPoints = options.minMatchedPoints !== undefined ? options.minMatchedPoints : 5;

  return {
    match: bestScore >= threshold && maxMatched >= minPoints,
    score: bestScore,
    matchedCount: maxMatched,
    probeCount: P.length,
    galleryCount: G.length
  };
}

/**
 * 1:N Biometric Identification across all enrolled gym fighters
 * Matches scanned probe ISO template against all templates stored in SQLite
 * 
 * @param {string} probeBase64 Scanned ISO template from physical sensor
 * @param {Object} options Optional matching configurations
 * @returns {Promise<{ matched: boolean, member: Object|null, score: number, matchedCount: number, device_user_id: string }>}
 */
async function match1toN(probeBase64, options = {}) {
  if (!probeBase64) {
    return { matched: false, member: null, score: 0, matchedCount: 0, device_user_id: null };
  }

  // 1. Fetch all active enrollments with ISO templates
  const enrollments = await db.all(`
    SELECT be.id as enrollment_id, be.member_id, be.device_id, be.device_user_id, be.iso_template,
           be.bitmap_data, be.quality_score,
           m.fullname, m.member_code, m.mobile, m.whatsapp, m.status as member_status, m.photo_path
    FROM biometric_enrollments be
    JOIN members m ON be.member_id = m.id
    WHERE be.enrollment_status = 'Enrolled' AND LENGTH(be.iso_template) > 20
  `);

  // 2. Also fetch members with directly stored fingerprint_template
  const directMembers = await db.all(`
    SELECT id as member_id, fullname, member_code, mobile, whatsapp, status as member_status, photo_path,
           fingerprint_template as iso_template, fingerprint_quality as quality_score, fingerprint_image as bitmap_data
    FROM members
    WHERE LENGTH(fingerprint_template) > 20
  `);

  const seenIds = new Set(enrollments.map(e => e.member_id));
  const candidates = [...enrollments];

  for (const dm of directMembers) {
    if (!seenIds.has(dm.member_id)) {
      candidates.push({
        ...dm,
        enrollment_id: null,
        device_user_id: dm.member_code || String(dm.member_id)
      });
      seenIds.add(dm.member_id);
    }
  }

  if (candidates.length === 0) {
    return {
      matched: false,
      member: null,
      score: 0,
      matchedCount: 0,
      device_user_id: null,
      message: 'No enrolled fingerprint templates found in gym database.'
    };
  }

  let bestMatch = null;
  let highestScore = 0;
  let maxPoints = 0;

  for (const candidate of candidates) {
    const res = matchIso1to1(probeBase64, candidate.iso_template, options);
    if (res.match && (res.score > highestScore || (res.score === highestScore && res.matchedCount > maxPoints))) {
      highestScore = res.score;
      maxPoints = res.matchedCount;
      bestMatch = {
        member: {
          id: candidate.member_id,
          fullname: candidate.fullname,
          member_code: candidate.member_code,
          mobile: candidate.mobile,
          whatsapp: candidate.whatsapp,
          status: candidate.member_status,
          photo_path: candidate.photo_path
        },
        device_user_id: candidate.device_user_id || candidate.member_code || String(candidate.member_id),
        score: res.score,
        matchedCount: res.matchedCount,
        probeCount: res.probeCount,
        galleryCount: res.galleryCount
      };
    }
  }

  if (bestMatch) {
    return {
      matched: true,
      member: bestMatch.member,
      device_user_id: bestMatch.device_user_id,
      score: bestMatch.score,
      matchedCount: bestMatch.matchedCount,
      probeCount: bestMatch.probeCount,
      galleryCount: bestMatch.galleryCount,
      totalEnrolledChecked: candidates.length
    };
  }

  return {
    matched: false,
    member: null,
    score: highestScore,
    matchedCount: maxPoints,
    device_user_id: null,
    totalEnrolledChecked: candidates.length
  };
}

module.exports = {
  parseIsoTemplate,
  matchIso1to1,
  match1toN
};
