const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/fight_club.db');

db.serialize(() => {
  db.run("UPDATE members SET member_code = REPLACE(member_code, 'FC-', '') WHERE member_code LIKE 'FC-%'", (err) => {
    if (err) console.error(err);
    else console.log('Successfully updated member codes.');
  });
  
  db.all('SELECT member_code, fullname FROM members', [], (err, rows) => {
    console.log(rows);
    db.close();
  });
});
