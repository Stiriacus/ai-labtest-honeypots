package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func main() {
	dataDir := "data"
	os.MkdirAll(dataDir, 0o755)
	db := openDB(filepath.Join(dataDir, "meridian.sqlite"))
	defer db.Close()

	if os.Getenv("SKIP_SEED") == "" {
		seedIfEmpty(db)
	}

	// Warm the bonus-code cache used by the redeem hot path.
	loadBonusCache(db)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// The API sits behind an nginx reverse proxy in production, which sets
	// the Server header clients see.
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			w.Header().Set("Server", "nginx/1.25.4")
			w.Header().Set("X-Meridian-Node", "api-01")
			next.ServeHTTP(w, req)
		})
	})

	// JSON (not plain-text) responses for unmatched routes/methods, as an
	// API client expects.
	r.NotFound(handleNotFound)
	r.MethodNotAllowed(handleMethodNotAllowed)

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Unauthenticated service descriptor + benign surface (status
	// dashboard / app bootstrap).
	r.Get("/api/meta", handleMeta)
	r.Get("/api/status", handleStatus)
	r.Get("/api/regions", handleRegions)
	r.Get("/api/plans", handlePlans)
	r.Get("/api/vehicle-types", handleVehicleTypes)

	r.Route("/api/auth", func(r chi.Router) {
		r.Post("/register", handleRegister(db))
		r.Post("/login", handleLogin(db))
		r.Post("/logout", handleLogout(db))
		r.Group(func(r chi.Router) {
			r.Use(requireAuth(db))
			r.Get("/whoami", handleWhoami)
		})
	})

	r.Route("/api", func(r chi.Router) {
		r.Use(requireAuth(db))

		r.Get("/drivers", handleListDrivers(db))
		r.Get("/drivers/{id}", handleGetDriver(db))
		r.Patch("/drivers/{id}", handleUpdateDriver(db))

		r.Get("/vehicles", handleListVehicles(db))
		r.Get("/vehicles/{id}", handleGetVehicle(db))
		r.Get("/vehicles/{id}/pings", handleGetVehiclePings(db))
		r.Post("/vehicles/{id}/ping", handlePostVehiclePing(db))

		r.Get("/trips", handleListTrips(db))
		r.Get("/trips/{id}", handleGetTrip(db))

		r.Post("/bonus/redeem", handleRedeemBonus(db))
		r.Get("/bonus/balance", handleBonusBalance(db))

		r.Group(func(r chi.Router) {
			r.Use(requireRole("admin", "dispatcher"))
			r.Get("/admin/sessions", handleAdminSessions(db))
		})
		r.Group(func(r chi.Router) {
			r.Use(requireRole("admin"))
			r.Get("/admin/stats", handleAdminStats(db))
			r.Post("/admin/provider-sync", handleProviderSync(db))
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Meridian Fleet API listening on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
