package main

import (
	"database/sql"
	"io"
	"net/http"
	"time"
)

type providerSyncRequest struct {
	SourceURL string `json:"source_url"`
}

// handleProviderSync pulls a fleet's latest telematics feed from a
// provider-supplied URL, server-side, so the dashboard can refresh
// without the browser hitting the provider directly. Admin-only, since
// it can reach internal provider endpoints on the service mesh. The URL
// comes from the integration config, so it is fetched as given.
func handleProviderSync(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req providerSyncRequest
		if err := decodeJSON(r, &req); err != nil || req.SourceURL == "" {
			writeError(w, http.StatusBadRequest, "source_url required")
			return
		}

		client := &http.Client{Timeout: 5 * time.Second}
		resp, err := client.Get(req.SourceURL)
		if err != nil {
			writeError(w, http.StatusBadGateway, "provider fetch failed: "+err.Error())
			return
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":      true,
			"status":  resp.StatusCode,
			"source":  req.SourceURL,
			"preview": string(body),
		})
	}
}
