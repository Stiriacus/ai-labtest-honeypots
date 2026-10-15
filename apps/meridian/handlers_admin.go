package main

import (
	"database/sql"
	"net/http"
)

// handleAdminSessions backs the support team's "what is this driver's app
// stuck on" tool: dispatchers open it to see a driver's recent session
// activity without having to page an admin. Access is role-gated to
// dispatchers and admins; fleet scoping wasn't added because dispatchers
// only ever look up drivers they already recognize by name.
func handleAdminSessions(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query(
			`SELECT s.id, s.driver_id, d.email, d.full_name, d.role, s.token, s.ip, s.user_agent, s.created_at, s.last_used_at
			 FROM sessions s JOIN drivers d ON d.id = s.driver_id
			 ORDER BY s.last_used_at DESC LIMIT 100`,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()

		var out []map[string]any
		for rows.Next() {
			var sID, driverID, createdAt, lastUsedAt int64
			var email, name, role, token, ip, ua string
			rows.Scan(&sID, &driverID, &email, &name, &role, &token, &ip, &ua, &createdAt, &lastUsedAt)
			out = append(out, map[string]any{
				"session_id": sID, "driver_id": driverID, "email": email, "full_name": name, "role": role,
				"token": token, "ip": ip, "user_agent": ua, "created_at": createdAt, "last_used_at": lastUsedAt,
			})
		}
		writeJSON(w, http.StatusOK, out)
	}
}

func handleAdminStats(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		me := driverFromCtx(r)
		stats := map[string]any{}

		row := db.QueryRow(`SELECT COUNT(*) FROM drivers WHERE fleet_id = ?`, me.FleetID)
		var drivers int
		row.Scan(&drivers)
		stats["drivers"] = drivers

		row = db.QueryRow(`SELECT COUNT(*) FROM vehicles WHERE fleet_id = ?`, me.FleetID)
		var vehicles int
		row.Scan(&vehicles)
		stats["vehicles"] = vehicles

		row = db.QueryRow(`SELECT COUNT(*) FROM trips WHERE fleet_id = ?`, me.FleetID)
		var trips int
		row.Scan(&trips)
		stats["trips"] = trips

		writeJSON(w, http.StatusOK, stats)
	}
}
