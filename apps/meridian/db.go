package main

import (
	"database/sql"
	"log"

	_ "modernc.org/sqlite"
)

const schema = `
CREATE TABLE IF NOT EXISTS fleets (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drivers (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	fleet_id INTEGER NOT NULL,
	email TEXT UNIQUE NOT NULL,
	password_hash TEXT NOT NULL,
	full_name TEXT NOT NULL,
	phone TEXT,
	pay_rate_cents INTEGER DEFAULT 0,
	role TEXT NOT NULL DEFAULT 'driver',
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	fleet_id INTEGER NOT NULL,
	plate TEXT NOT NULL,
	make TEXT,
	model TEXT,
	status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS trips (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	fleet_id INTEGER NOT NULL,
	vehicle_id INTEGER NOT NULL,
	driver_id INTEGER NOT NULL,
	start_lat REAL,
	start_lng REAL,
	end_lat REAL,
	end_lng REAL,
	distance_km REAL,
	started_at INTEGER NOT NULL,
	ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS vehicle_pings (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	vehicle_id INTEGER NOT NULL,
	lat REAL NOT NULL,
	lng REAL NOT NULL,
	speed_kph REAL,
	recorded_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	driver_id INTEGER NOT NULL,
	token TEXT UNIQUE NOT NULL,
	user_agent TEXT,
	ip TEXT,
	created_at INTEGER NOT NULL,
	last_used_at INTEGER NOT NULL
);
`

func openDB(path string) *sql.DB {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	if _, err := db.Exec(schema); err != nil {
		log.Fatalf("schema: %v", err)
	}
	return db
}
