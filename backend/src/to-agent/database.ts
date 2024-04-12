import * as mysql from 'mysql2';
import { HistoryStatOfOneServer, HistoryStat } from 'zaychik-server-proto';

// Get MYSQL_USER, MYSQL_DATABASE, MYSQL_PASSWORD from env vars
const { MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_DATABASE, MYSQL_PASSWORD } = process.env;
if (!MYSQL_HOST || !MYSQL_PORT || !MYSQL_USER || !MYSQL_DATABASE || !MYSQL_PASSWORD) {
  console.error('Missing required environment variable MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_DATABASE, or MYSQL_PASSWORD');
  process.exit(1);
}

// Create the connection pool
const pool = mysql.createPool({
  host: MYSQL_HOST,
  port: parseInt(MYSQL_PORT),
  user: MYSQL_USER,
  database: MYSQL_DATABASE,
  password: MYSQL_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Create the table that stores history stats of CPUs, GPUs, Fans, and nodes
pool.query('CREATE TABLE IF NOT EXISTS history_stats (id INT AUTO_INCREMENT PRIMARY KEY, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, powers JSON NOT NULL)', (err: any, results: any, fields: any) => {
  if (err) {
	console.error(err);
  }
});

function insertHistoryStat(powers: HistoryStat) {
  pool.query('INSERT INTO history_stats (powers) VALUES (?)', [JSON.stringify(powers)], (err: any, results: any, fields: any) => {
	if (err) {
	  console.error(err);
	}
  });
}

export { insertHistoryStat };