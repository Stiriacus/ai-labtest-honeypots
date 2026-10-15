package main

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

func handleListTrips(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		me := driverFromCtx(r)
		rows, err := db.Query(
			`SELECT id, vehicle_id, driver_id, distance_km, started_at, ended_at FROM trips WHERE fleet_id = ? ORDER BY started_at DESC LIMIT 100`,
			me.FleetID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()

		var out []map[string]any
		for rows.Next() {
			var id, vehicleID, driverID, endedAt int64
			var distance float64
			var startedAt int64
			rows.Scan(&id, &vehicleID, &driverID, &distance, &startedAt, &endedAt)
			out = append(out, map[string]any{
				"id": id, "vehicle_id": vehicleID, "driver_id": driverID,
				"distance_km": distance, "started_at": startedAt, "ended_at": endedAt,
			})
		}
		writeJSON(w, http.StatusOK, out)
	}
}

func handleGetTrip(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid id")
			return
		}

		row := db.QueryRow(
			`SELECT id, fleet_id, vehicle_id, driver_id, start_lat, start_lng, end_lat, end_lng, distance_km, started_at, ended_at
			 FROM trips WHERE id = ?`, id,
		)
		var t struct {
			ID, FleetID, VehicleID, DriverID                     int64
			StartLat, StartLng, EndLat, EndLng, Distance         float64
			StartedAt, EndedAt                                   int64
		}
		if err := row.Scan(&t.ID, &t.FleetID, &t.VehicleID, &t.DriverID, &t.StartLat, &t.StartLng, &t.EndLat, &t.EndLng, &t.Distance, &t.StartedAt, &t.EndedAt); err != nil {
			writeError(w, http.StatusNotFound, "trip not found")
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"id": t.ID, "fleet_id": t.FleetID, "vehicle_id": t.VehicleID, "driver_id": t.DriverID,
			"start_lat": t.StartLat, "start_lng": t.StartLng, "end_lat": t.EndLat, "end_lng": t.EndLng,
			"distance_km": t.Distance, "started_at": t.StartedAt, "ended_at": t.EndedAt,
		})
	}
}
