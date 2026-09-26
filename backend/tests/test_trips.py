import re

from tests.conftest import signup

TRIP = {
    "destination": "Kyoto, Japan",
    "start_date": "2026-10-01",
    "end_date": "2026-10-03",
    "trip_type": "couple",
}
TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


def create_trip(client, headers, **overrides):
    return client.post("/api/v1/trips", json={**TRIP, **overrides}, headers=headers)


def test_create_trip_generates_days(client, auth_headers):
    response = create_trip(client, auth_headers)
    assert response.status_code == 201
    trip = response.json()
    assert set(trip) == {
        "id",
        "destination",
        "start_date",
        "end_date",
        "trip_type",
        "created_at",
        "days",
    }
    assert TIMESTAMP.match(trip["created_at"])
    assert [(d["day_number"], d["date"]) for d in trip["days"]] == [
        (1, "2026-10-01"),
        (2, "2026-10-02"),
        (3, "2026-10-03"),
    ]
    assert all(d["activities"] == [] for d in trip["days"])


def test_same_day_trip_has_one_day(client, auth_headers):
    trip = create_trip(client, auth_headers, end_date="2026-10-01").json()
    assert len(trip["days"]) == 1


def test_end_before_start_is_400(client, auth_headers):
    response = create_trip(client, auth_headers, end_date="2026-09-30")
    assert response.status_code == 400
    assert response.json() == {"detail": "end_date must be on or after start_date"}


def test_invalid_fields_are_422(client, auth_headers):
    assert create_trip(client, auth_headers, trip_type="business").status_code == 422
    assert create_trip(client, auth_headers, destination="   ").status_code == 422
    assert create_trip(client, auth_headers, start_date="2026-02-30").status_code == 422


def test_list_returns_summaries_only_for_owner(client, auth_headers):
    create_trip(client, auth_headers)
    other = signup(client, "other")
    create_trip(client, other, destination="Goa")
    trips = client.get("/api/v1/trips", headers=auth_headers).json()
    assert len(trips) == 1
    assert trips[0]["destination"] == "Kyoto, Japan"
    assert "days" not in trips[0]


def test_other_users_trip_is_404(client, auth_headers):
    trip_id = create_trip(client, auth_headers).json()["id"]
    other = signup(client, "other")
    assert client.get(f"/api/v1/trips/{trip_id}", headers=other).status_code == 404
    assert client.delete(f"/api/v1/trips/{trip_id}", headers=other).status_code == 404
    assert client.get(f"/api/v1/trips/{trip_id}", headers=auth_headers).status_code == 200


def test_delete_trip_cascades(client, auth_headers):
    trip = create_trip(client, auth_headers).json()
    day_id = trip["days"][0]["id"]
    activity = client.post(
        f"/api/v1/trips/{trip['id']}/days/{day_id}/activities",
        json={"text": "Temple"},
        headers=auth_headers,
    ).json()
    response = client.delete(f"/api/v1/trips/{trip['id']}", headers=auth_headers)
    assert response.status_code == 204
    assert response.content == b""
    assert client.get(f"/api/v1/trips/{trip['id']}", headers=auth_headers).status_code == 404
    assert (
        client.delete(f"/api/v1/activities/{activity['id']}", headers=auth_headers).status_code
        == 404
    )
