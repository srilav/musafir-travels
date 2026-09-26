from tests.conftest import signup
from tests.test_trips import TIMESTAMP, create_trip


def _setup(client, headers):
    trip = create_trip(client, headers).json()
    return trip["id"], trip["days"][0]["id"], trip["days"][1]["id"]


def test_add_activities_in_insertion_order(client, auth_headers):
    trip_id, day_id, _ = _setup(client, auth_headers)
    url = f"/api/v1/trips/{trip_id}/days/{day_id}/activities"
    first = client.post(url, json={"text": "  Visit Fushimi Inari  "}, headers=auth_headers)
    second = client.post(url, json={"text": "Dinner"}, headers=auth_headers)
    assert first.status_code == 201
    assert first.json()["text"] == "Visit Fushimi Inari"
    assert TIMESTAMP.match(first.json()["created_at"])
    assert (first.json()["sort_order"], second.json()["sort_order"]) == (0, 1)
    trip = client.get(f"/api/v1/trips/{trip_id}", headers=auth_headers).json()
    assert [a["text"] for a in trip["days"][0]["activities"]] == ["Visit Fushimi Inari", "Dinner"]


def test_blank_activity_text_is_400(client, auth_headers):
    trip_id, day_id, _ = _setup(client, auth_headers)
    url = f"/api/v1/trips/{trip_id}/days/{day_id}/activities"
    assert client.post(url, json={"text": "   "}, headers=auth_headers).status_code == 400


def test_day_must_belong_to_trip_and_owner(client, auth_headers):
    trip_id, day_id, _ = _setup(client, auth_headers)
    other_trip_id = create_trip(client, auth_headers, destination="Goa").json()["id"]
    url = f"/api/v1/trips/{other_trip_id}/days/{day_id}/activities"
    assert client.post(url, json={"text": "x"}, headers=auth_headers).status_code == 404
    other = signup(client, "other")
    url = f"/api/v1/trips/{trip_id}/days/{day_id}/activities"
    assert client.post(url, json={"text": "x"}, headers=other).status_code == 404


def test_edit_and_delete_activity(client, auth_headers):
    trip_id, day_id, _ = _setup(client, auth_headers)
    activity = client.post(
        f"/api/v1/trips/{trip_id}/days/{day_id}/activities",
        json={"text": "Visit Fushimi Inari"},
        headers=auth_headers,
    ).json()
    url = f"/api/v1/activities/{activity['id']}"
    other = signup(client, "other")
    assert client.patch(url, json={"text": "Hack"}, headers=other).status_code == 404
    assert client.patch(url, json={"text": " "}, headers=auth_headers).status_code == 400
    edited = client.patch(url, json={"text": "Visit at sunrise"}, headers=auth_headers)
    assert edited.status_code == 200
    assert edited.json()["text"] == "Visit at sunrise"
    assert edited.json()["sort_order"] == activity["sort_order"]
    assert client.delete(url, headers=other).status_code == 404
    assert client.delete(url, headers=auth_headers).status_code == 204
    assert client.delete(url, headers=auth_headers).status_code == 404
