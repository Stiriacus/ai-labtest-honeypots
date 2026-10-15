package main

import (
	"database/sql"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
)

func handleListVehicles(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		me := driverFromCtx(r)
		rows, err := db.Query(`SELECT id, plate, make, model, status FROM vehicles WHERE fleet_id = ? ORDER BY plate`, me.FleetID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()

		var out []map[string]any
		for rows.Next() {
			var id int64
			var plate, make_, model, status string
			rows.Scan(&id, &plate, &make_, &model, &status)
			out = append(out, map[string]any{"id": id, "plate": plate, "make": make_, "model": model, "status": status})
		}
		writeJSON(w, http.StatusOK, out)
	}
}

func handleGetVehicle(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid id")
			return
		}

		row := db.QueryRow(`SELECT id, fleet_id, plate, make, model, status FROM vehicles WHERE id = ?`, id)
		var vID, fleetID int64
		var plate, make_, model, status string
		if err := row.Scan(&vID, &fleetID, &plate, &make_, &model, &status); err != nil {
			writeError(w, http.StatusNotFound, "vehicle not found")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"id": vID, "fleet_id": fleetID, "plate": plate, "make": make_, "model": model, "status": status,
		})
	}
}

func handleGetVehiclePings(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid id")
			return
		}

		// Location history is used by the live map widget, which only
		// has the vehicle id to work with (it doesn't carry fleet
		// context down into the map component).
		rows, err := db.Query(
			`SELECT lat, lng, speed_kph, recorded_at FROM vehicle_pings WHERE vehicle_id = ? ORDER BY recorded_at DESC LIMIT 50`, id,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()

		var out []map[string]any
		for rows.Next() {
			var lat, lng, speed float64
			var recordedAt int64
			rows.Scan(&lat, &lng, &speed, &recordedAt)
			out = append(out, map[string]any{"lat": lat, "lng": lng, "speed_kph": speed, "recorded_at": recordedAt})
		}
		writeJSON(w, http.StatusOK, out)
	}
}

type pingRequest struct {
	Lat      float64 `json:"lat"`
	Lng      float64 `json:"lng"`
	SpeedKph float64 `json:"speed_kph"`
}

func handlePostVehiclePing(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid id")
			return
		}

		var req pingRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		_, err = db.Exec(
			`INSERT INTO vehicle_pings (vehicle_id, lat, lng, speed_kph, recorded_at) VALUES (?, ?, ?, ?, ?)`,
			id, req.Lat, req.Lng, req.SpeedKph, time.Now().Unix(),
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "insert failed")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"status": "recorded"})
	}
}
