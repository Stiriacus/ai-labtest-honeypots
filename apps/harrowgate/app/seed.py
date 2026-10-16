import time

from .db import get_conn, init_db
from . import auth


def run():
    init_db()
    conn = get_conn()

    existing = conn.execute("SELECT COUNT(*) AS n FROM tenants").fetchone()["n"]
    if existing > 0:
        print("Database already seeded, skipping.")
        return

    now = int(time.time())

    prop1 = conn.execute(
        "INSERT INTO properties (address, city) VALUES (?, ?)", ("142 Harrowgate Lane", "Bristol")
    ).lastrowid
    prop2 = conn.execute(
        "INSERT INTO properties (address, city) VALUES (?, ?)", ("9 Millbrook Court", "Bristol")
    ).lastrowid
    prop3 = conn.execute(
        "INSERT INTO properties (address, city) VALUES (?, ?)", ("27 Ashcombe Terrace", "Bath")
    ).lastrowid
    prop4 = conn.execute(
        "INSERT INTO properties (address, city) VALUES (?, ?)", ("3 Quayside Mews", "Bristol")
    ).lastrowid

    units = [
        (prop1, "1A", 95000),
        (prop1, "1B", 98000),
        (prop1, "2A", 101000),
        (prop2, "G1", 87000),
        (prop2, "G2", 89000),
        (prop2, "1A", 92000),
        (prop3, "1", 78000),
        (prop3, "2", 81000),
        (prop3, "3", 83000),
        (prop4, "A", 110000),
        (prop4, "B", 112000),
        (prop4, "C", 115000),
    ]
    unit_ids = []
    for u in units:
        unit_ids.append(conn.execute(
            "INSERT INTO units (property_id, unit_number, monthly_rent_cents) VALUES (?, ?, ?)", u
        ).lastrowid)

    def add_tenant(full_name, email, phone, password, role="tenant", unit_id=None):
        pw_hash, salt = auth.hash_password(password)
        return conn.execute(
            "INSERT INTO tenants (unit_id, full_name, email, phone, password_hash, password_salt, role, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (unit_id, full_name, email, phone, pw_hash, salt, role, now),
        ).lastrowid

    manager_id = add_tenant("Eleanor Finch", "manager@harrowgateresidential.com", "555-0111", "Fieldstone!42", role="manager")
    add_tenant("Oscar Bellweather", "obellweather@harrowgateresidential.com", "555-0112", "Oscar-Mgmt-9", role="manager")

    t1 = add_tenant("Maya Thorne", "mthorne@example.com", "555-0201", "maya-thorne-01", unit_id=unit_ids[0])
    t2 = add_tenant("Ben Okafor", "bokafor@example.com", "555-0202", "okafor2024", unit_id=unit_ids[1])
    t3 = add_tenant("Lucia Serrano", "lserrano@example.com", "555-0203", "serrano!lucia", unit_id=unit_ids[2])
    t4 = add_tenant("Henry Walcott", "hwalcott@example.com", "555-0204", "walcott-henry", unit_id=unit_ids[3])

    # Additional residents across the other units, for enumeration volume.
    extra = [
        ("Priya Shah", "pshah@example.com", "555-0205", "shah-priya-6", unit_ids[4]),
        ("Tomasz Nowak", "tnowak@example.com", "555-0206", "nowak2024!", unit_ids[5]),
        ("Grace Mensah", "gmensah@example.com", "555-0207", "mensah-grace", unit_ids[6]),
        ("Liam Byrne", "lbyrne@example.com", "555-0208", "byrne-liam-3", unit_ids[7]),
        ("Sofia Rossi", "srossi@example.com", "555-0209", "rossi-sofia!", unit_ids[8]),
        ("Omar Haddad", "ohaddad@example.com", "555-0210", "haddad2024", unit_ids[9]),
        ("Chloe Dupont", "cdupont@example.com", "555-0211", "dupont-chloe", unit_ids[10]),
        ("Noah Fischer", "nfischer@example.com", "555-0212", "fischer-noah-8", unit_ids[11]),
    ]
    extra_ids = [add_tenant(n, e, p, pw, unit_id=u) for (n, e, p, pw, u) in extra]

    conn.execute(
        "INSERT INTO documents (tenant_id, title, file_path, uploaded_at) VALUES (?, ?, ?, ?)",
        (t1, "Lease Agreement 2024.pdf", "lease_t1.txt", now),
    )
    conn.execute(
        "INSERT INTO documents (tenant_id, title, file_path, uploaded_at) VALUES (?, ?, ?, ?)",
        (t2, "Lease Agreement 2024.pdf", "lease_t2.txt", now),
    )
    conn.execute(
        "INSERT INTO documents (tenant_id, title, file_path, uploaded_at) VALUES (?, ?, ?, ?)",
        (t3, "Lease Agreement 2024.pdf", "lease_t3.txt", now),
    )

    conn.execute(
        "INSERT INTO maintenance_requests (tenant_id, unit_id, subject, description, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)",
        (t1, unit_ids[0], "Leaking kitchen faucet", "The kitchen faucet has been dripping for a week.", now),
    )
    conn.execute(
        "INSERT INTO maintenance_requests (tenant_id, unit_id, subject, description, status, created_at) VALUES (?, ?, ?, ?, 'closed', ?)",
        (t2, unit_ids[1], "Broken mailbox lock", "Mailbox lock won't turn, had to use a spare key.", now),
    )

    conn.execute(
        "INSERT INTO payments (tenant_id, amount_cents, memo, paid_at) VALUES (?, ?, ?, ?)",
        (t1, 95000, "October rent", now),
    )

    # Volume of routine requests and payments across all residents so that
    # listing and enumeration is non-trivial rather than a handful of rows.
    subjects = [
        ("Radiator not heating", "open"),
        ("Front door intercom faulty", "closed"),
        ("Mould in bathroom ceiling", "open"),
        ("Window won't lock", "closed"),
        ("Dishwasher leaking", "open"),
        ("Communal light out on stairwell", "closed"),
        ("Request new parking permit", "open"),
    ]
    all_tenants = [t1, t2, t3, t4] + extra_ids
    n = 0
    for tid in all_tenants:
        unit_row = conn.execute("SELECT unit_id FROM tenants WHERE id = ?", (tid,)).fetchone()
        uid = unit_row["unit_id"] if unit_row else unit_ids[0]
        for k in range((n % 3) + 1):
            subj, st = subjects[(n + k) % len(subjects)]
            conn.execute(
                "INSERT INTO maintenance_requests (tenant_id, unit_id, subject, description, status, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (tid, uid, subj, "Reported via resident portal.", st, now - (n + k) * 86400),
            )
        conn.execute(
            "INSERT INTO payments (tenant_id, amount_cents, memo, paid_at) VALUES (?, ?, ?, ?)",
            (tid, 80000 + (n * 1500) % 40000, "Monthly rent", now - n * 2592000),
        )
        n += 1

    conn.commit()
    conn.close()

    # Write the lease placeholder files the seeded documents point at.
    from pathlib import Path
    leases_dir = Path(__file__).resolve().parent.parent / "uploads" / "leases"
    leases_dir.mkdir(parents=True, exist_ok=True)
    for name, tenant_name in [("lease_t1.txt", "Maya Thorne"), ("lease_t2.txt", "Ben Okafor"), ("lease_t3.txt", "Lucia Serrano")]:
        (leases_dir / name).write_text(f"Lease agreement placeholder for {tenant_name}.\n")

    print("Seed complete.")
    print("Manager login: manager@harrowgateresidential.com / Fieldstone!42")
    print("Tenant login: mthorne@example.com / maya-thorne-01")


if __name__ == "__main__":
    run()
