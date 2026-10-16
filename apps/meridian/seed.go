package main

import (
	"database/sql"
	"log"
	"time"
)

func seedIfEmpty(db *sql.DB) {
	var count int
	db.QueryRow(`SELECT COUNT(*) FROM drivers`).Scan(&count)
	if count > 0 {
		log.Println("Database already seeded, skipping.")
		return
	}

	now := time.Now().Unix()

	fleetA, _ := execLastID(db, `INSERT INTO fleets (name) VALUES (?)`, "Northside Courier Co.")
	fleetB, _ := execLastID(db, `INSERT INTO fleets (name) VALUES (?)`, "Bayshore Logistics")

	mustHash := func(pw string) string {
		h, err := hashPassword(pw)
		if err != nil {
			log.Fatal(err)
		}
		return h
	}

	adminA, _ := execLastID(db,
		`INSERT INTO drivers (fleet_id, email, password_hash, full_name, phone, pay_rate_cents, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		fleetA, "admin@northsidecourier.com", mustHash("Northside#Ops9"), "Renata Kobayashi", "555-0401", 0, "admin", now,
	)
	dispA, _ := execLastID(db,
		`INSERT INTO drivers (fleet_id, email, password_hash, full_name, phone, pay_rate_cents, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		fleetA, "dispatch@northsidecourier.com", mustHash("dispatch-north-1"), "Tomás Rivera", "555-0402", 0, "dispatcher", now,
	)
	drv1, _ := execLastID(db,
		`INSERT INTO drivers (fleet_id, email, password_hash, full_name, phone, pay_rate_cents, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		fleetA, "jkowalski@northsidecourier.com", mustHash("kowalski88"), "Jan Kowalski", "555-0403", 2400, "driver", now,
	)
	drv2, _ := execLastID(db,
		`INSERT INTO drivers (fleet_id, email, password_hash, full_name, phone, pay_rate_cents, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		fleetA, "amendes@northsidecourier.com", mustHash("mendes-amara-7"), "Amara Mendes", "555-0404", 2550, "driver", now,
	)

	adminB, _ := execLastID(db,
		`INSERT INTO drivers (fleet_id, email, password_hash, full_name, phone, pay_rate_cents, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		fleetB, "admin@bayshorelogistics.com", mustHash("BayshoreAdmin!3"), "Chen Wei", "555-0501", 0, "admin", now,
	)
	drv3, _ := execLastID(db,
		`INSERT INTO drivers (fleet_id, email, password_hash, full_name, phone, pay_rate_cents, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		fleetB, "lmoreau@bayshorelogistics.com", mustHash("moreau-lea-5"), "Léa Moreau", "555-0502", 2300, "driver", now,
	)

	v1, _ := execLastID(db, `INSERT INTO vehicles (fleet_id, plate, make, model, status) VALUES (?, ?, ?, ?, ?)`, fleetA, "NC-4021", "Ford", "Transit", "active")
	v2, _ := execLastID(db, `INSERT INTO vehicles (fleet_id, plate, make, model, status) VALUES (?, ?, ?, ?, ?)`, fleetA, "NC-4022", "Ford", "Transit", "active")
	v3, _ := execLastID(db, `INSERT INTO vehicles (fleet_id, plate, make, model, status) VALUES (?, ?, ?, ?, ?)`, fleetB, "BL-1180", "Mercedes", "Sprinter", "active")

	db.Exec(`INSERT INTO trips (fleet_id, vehicle_id, driver_id, start_lat, start_lng, end_lat, end_lng, distance_km, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		fleetA, v1, drv1, 51.0504, 13.7373, 51.0601, 13.7488, 8.4, now-7200, now-6000)
	db.Exec(`INSERT INTO trips (fleet_id, vehicle_id, driver_id, start_lat, start_lng, end_lat, end_lng, distance_km, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		fleetA, v2, drv2, 51.0450, 13.7300, 51.0700, 13.7600, 12.1, now-3600, now-2400)
	db.Exec(`INSERT INTO trips (fleet_id, vehicle_id, driver_id, start_lat, start_lng, end_lat, end_lng, distance_km, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		fleetB, v3, drv3, 37.7749, -122.4194, 37.8044, -122.2712, 18.7, now-5400, now-3600)

	db.Exec(`INSERT INTO vehicle_pings (vehicle_id, lat, lng, speed_kph, recorded_at) VALUES (?, ?, ?, ?, ?)`, v1, 51.0550, 13.7420, 42.0, now-3000)
	db.Exec(`INSERT INTO vehicle_pings (vehicle_id, lat, lng, speed_kph, recorded_at) VALUES (?, ?, ?, ?, ?)`, v3, 37.7900, -122.3500, 55.0, now-1800)

	// Additional vehicles, trips and location pings across both fleets so
	// listing and enumeration is non-trivial rather than a handful of rows.
	plates := []struct {
		fleet       int64
		plate       string
		make, model string
	}{
		{fleetA, "NC-4023", "Ford", "Transit"},
		{fleetA, "NC-4024", "Renault", "Master"},
		{fleetA, "NC-4025", "Iveco", "Daily"},
		{fleetB, "BL-1181", "Mercedes", "Sprinter"},
		{fleetB, "BL-1182", "MAN", "TGE"},
		{fleetB, "BL-1183", "Volkswagen", "Crafter"},
	}
	driversByFleet := map[int64][]int64{fleetA: {drv1, drv2}, fleetB: {drv3}}
	for i, p := range plates {
		vid, _ := execLastID(db, `INSERT INTO vehicles (fleet_id, plate, make, model, status) VALUES (?, ?, ?, ?, 'active')`,
			p.fleet, p.plate, p.make, p.model)
		drvs := driversByFleet[p.fleet]
		drv := drvs[i%len(drvs)]
		baseLat, baseLng := 51.05+float64(i)*0.01, 13.73+float64(i)*0.01
		for t := 0; t < (i%3)+1; t++ {
			db.Exec(`INSERT INTO trips (fleet_id, vehicle_id, driver_id, start_lat, start_lng, end_lat, end_lng, distance_km, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				p.fleet, vid, drv, baseLat, baseLng, baseLat+0.02, baseLng+0.03, 5.0+float64(i+t), now-int64((i+t+1)*4000), now-int64((i+t)*3000))
		}
		for g := 0; g < 5; g++ {
			db.Exec(`INSERT INTO vehicle_pings (vehicle_id, lat, lng, speed_kph, recorded_at) VALUES (?, ?, ?, ?, ?)`,
				vid, baseLat+float64(g)*0.001, baseLng+float64(g)*0.001, 30.0+float64(g*5), now-int64(g*600))
		}
	}

	_ = adminA
	_ = adminB
	_ = dispA

	log.Println("Seed complete.")
	log.Println("Fleet admin login: admin@northsidecourier.com / Northside#Ops9")
	log.Println("Dispatcher login:  dispatch@northsidecourier.com / dispatch-north-1")
	log.Println("Driver login:      jkowalski@northsidecourier.com / kowalski88")
}

func execLastID(db *sql.DB, query string, args ...any) (int64, error) {
	res, err := db.Exec(query, args...)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}
