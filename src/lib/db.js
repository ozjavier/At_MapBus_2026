import mysql from 'mysql2/promise';

// Un solo pool para toda la app. Astro en modo 'server' mantiene el
// proceso vivo entre requests, así que reutilizamos las conexiones
// en vez de abrir una nueva por cada consulta.
const pool = mysql.createPool({
  host: import.meta.env.DB_HOST || 'localhost',
  port: Number(import.meta.env.DB_PORT || 3306),
  user: import.meta.env.DB_USER || 'root',
  password: import.meta.env.DB_PASSWORD || '',
  database: import.meta.env.DB_NAME || 'atlixbus',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: false,
});

export default pool;
