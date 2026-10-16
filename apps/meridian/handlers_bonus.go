package main

import (
	"database/sql"
	"net/http"
	"sync"
	"time"
)

// Bonus codes are cached in memory so the redeem hot path checks the cap
// without a database round-trip on every call. The cache is populated
// from bonus_codes at startup and kept in step as codes are redeemed.
type bonusEntry struct {
	id       int64
	amount   int64
	maxR     int64
	active   bool
	redeemed int
}

var (
	bonusMu    sync.RWMutex
	bonusCache = map[string]*bonusEntry{}
)

func loadBonusCache(db *sql.DB) {
	rows, err := db.Query(`SELECT code, id, amount_cents, max_redemptions, redeemed_count, active FROM bonus_codes`)
	if err != nil {
		return
	}
	defer rows.Close()

	bonusMu.Lock()
	defer bonusMu.Unlock()
	for rows.Next() {
		var code string
		var e bonusEntry
		var active int
		rows.Scan(&code, &e.id, &e.amount, &e.maxR, &e.redeemed, &active)
		e.active = active == 1
		entry := e
		bonusCache[code] = &entry
	}
}

type bonusRedeemRequest struct {
	Code string `json:"code"`
}

// handleRedeemBonus applies a referral/onboarding bonus to the calling
// driver's earnings. It checks the code is active and still has headroom
// under its redemption cap (from the in-memory cache), credits the driver,
// and records the redemption.
func handleRedeemBonus(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		me := driverFromCtx(r)

		var req bonusRedeemRequest
		if err := decodeJSON(r, &req); err != nil || req.Code == "" {
			writeError(w, http.StatusBadRequest, "code required")
			return
		}

		bonusMu.RLock()
		entry := bonusCache[req.Code]
		bonusMu.RUnlock()
		if entry == nil || !entry.active {
			writeError(w, http.StatusNotFound, "unknown or inactive bonus code")
			return
		}

		// Check the cap against the cached redemption count.
		bonusMu.RLock()
		used := entry.redeemed
		bonusMu.RUnlock()
		if int64(used) >= entry.maxR {
			writeError(w, http.StatusConflict, "bonus code already fully redeemed")
			return
		}

		// Credit the driver, then record that the code was used.
		if _, err := db.Exec(`UPDATE drivers SET bonus_cents = bonus_cents + ? WHERE id = ?`, entry.amount, me.ID); err != nil {
			writeError(w, http.StatusInternalServerError, "could not apply bonus")
			return
		}

		bonusMu.Lock()
		entry.redeemed = used + 1
		bonusMu.Unlock()

		db.Exec(`UPDATE bonus_codes SET redeemed_count = redeemed_count + 1 WHERE id = ?`, entry.id)
		db.Exec(
			`INSERT INTO bonus_redemptions (code, driver_id, amount_cents, created_at) VALUES (?, ?, ?, ?)`,
			req.Code, me.ID, entry.amount, time.Now().Unix(),
		)

		writeJSON(w, http.StatusCreated, map[string]any{"applied": true, "amount_cents": entry.amount})
	}
}

func handleBonusBalance(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		me := driverFromCtx(r)
		var bonus int64
		db.QueryRow(`SELECT bonus_cents FROM drivers WHERE id = ?`, me.ID).Scan(&bonus)
		writeJSON(w, http.StatusOK, map[string]any{"driver_id": me.ID, "bonus_cents": bonus})
	}
}
