"""Backend test suite for Smart AI EQ."""
import time
import pytest
import requests

from conftest import BASE_URL

LIMITS = {
    8: [(20, 99), (100, 199), (200, 399), (400, 999), (1000, 2999), (3000, 5999), (6000, 11999), (12000, 20000)],
    10: [(20, 49), (50, 99), (100, 199), (200, 399), (400, 799), (800, 1599), (1600, 3199),
         (3200, 6399), (6400, 12799), (12800, 20000)],
}


# ----- Auth -----
class TestAuth:
    def test_login_admin_success(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"email": "admin@smarteq.app", "password": "SmartEQ2026!"}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "session_token" in d and d["user"]["role"] == "admin"

    def test_login_wrong_password(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"email": "admin@smarteq.app", "password": "WRONG"}, timeout=10)
        assert r.status_code == 401

    def test_me_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r.status_code == 401

    def test_me_ok_with_token(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers, timeout=10)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_logout(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login",
                     json={"email": "admin@smarteq.app", "password": "SmartEQ2026!"}, timeout=20)
        tok = r.json()["session_token"]
        h = {"Authorization": f"Bearer {tok}"}
        lo = requests.post(f"{BASE_URL}/api/auth/logout", headers=h, timeout=10)
        assert lo.status_code == 200
        # token should now be invalid
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=10)
        assert me.status_code == 401


# ----- Catalog -----
class TestCatalog:
    def test_catalog_structure(self, api):
        r = api.get(f"{BASE_URL}/api/catalog", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "manufacturers" in d and isinstance(d["manufacturers"], list)
        assert len(d["manufacturers"]) >= 10
        for m in d["manufacturers"]:
            assert "name" in m and "models" in m

    def test_nothing_headphone_1_firmware(self, api):
        d = api.get(f"{BASE_URL}/api/catalog", timeout=15).json()
        nothing = next((m for m in d["manufacturers"] if m["name"] == "Nothing"), None)
        assert nothing, "Nothing not in catalog"
        hp = next((h for h in nothing["models"] if h["name"] == "Headphone (1)"), None)
        assert hp, "Headphone (1) not in Nothing"
        assert "1.0.1.74" in hp["firmware"]
        # newest first
        assert hp["firmware"][0] == "1.0.1.74"

    def test_models_sorted_newest_first(self, api):
        d = api.get(f"{BASE_URL}/api/catalog", timeout=15).json()
        for m in d["manufacturers"]:
            years = [x.get("year") or 0 for x in m["models"]]
            assert years == sorted(years, reverse=True), f"Not newest-first for {m['name']}"


# ----- EQ Recommend -----
def _validate_bands(bands, count):
    assert len(bands) == count
    lims = LIMITS[count]
    for i, b in enumerate(bands):
        lo, hi = lims[i]
        assert lo <= b["freq"] <= hi, f"band {i} freq {b['freq']} outside {lo}-{hi}"
        assert -8 <= b["gain"] <= 8
        assert (b["gain"] * 2) == int(b["gain"] * 2), f"gain not multiple of 0.5: {b['gain']}"
        assert 0.1 <= b["q"] <= 10
        assert round(b["q"] * 10) == b["q"] * 10, f"q not step 0.1: {b['q']}"


class TestEqRecommend:
    def test_recommend_8band_with_song(self, admin_headers):
        payload = {"manufacturer": "Nothing", "model": "Headphone (1)", "firmware": "Latest",
                   "band_count": 8, "song_title": "Bohemian Rhapsody", "artist": "Queen"}
        r = requests.post(f"{BASE_URL}/api/eq/recommend", json=payload, headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        _validate_bands(d["bands"], 8)
        assert d["firmware"] == "1.0.1.74"  # Latest resolved
        assert d["band_count"] == 8

    def test_recommend_10band_no_song(self, admin_headers):
        payload = {"manufacturer": "Nothing", "model": "Headphone (1)", "firmware": "Latest",
                   "band_count": 10, "song_title": "", "artist": ""}
        r = requests.post(f"{BASE_URL}/api/eq/recommend", json=payload, headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        _validate_bands(d["bands"], 10)
        assert d["band_count"] == 10

    def test_recommend_cached(self, admin_headers):
        payload = {"manufacturer": "Nothing", "model": "Headphone (1)", "firmware": "Latest",
                   "band_count": 8, "song_title": "Bohemian Rhapsody", "artist": "Queen"}
        start = time.time()
        r = requests.post(f"{BASE_URL}/api/eq/recommend", json=payload, headers=admin_headers, timeout=60)
        elapsed = time.time() - start
        assert r.status_code == 200
        d = r.json()
        assert d.get("cached") is True
        assert elapsed < 10

    def test_recommend_requires_auth(self, api):
        r = api.post(f"{BASE_URL}/api/eq/recommend",
                     json={"manufacturer": "Sony", "model": "WH-1000XM5", "band_count": 8}, timeout=10)
        assert r.status_code == 401


# ----- EQ Preview -----
class TestEqPreview:
    def test_preview_empty(self, api):
        r = api.get(f"{BASE_URL}/api/eq/preview?p=", timeout=20)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("audio/wav")
        assert r.content[:4] == b"RIFF"

    def test_preview_with_bands(self, api):
        # band spec format: freq:gain:q,freq:gain:q...
        spec = "100:3:1.0,1000:-2:1.5,8000:2:0.8"
        r = api.get(f"{BASE_URL}/api/eq/preview", params={"p": spec}, timeout=20)
        assert r.status_code == 200
        assert r.content[:4] == b"RIFF"

    def test_preview_bad_spec(self, api):
        r = api.get(f"{BASE_URL}/api/eq/preview", params={"p": "abcdef;drop"}, timeout=10)
        assert r.status_code == 400


# ----- Feedback -----
class TestFeedback:
    def test_feedback_requires_auth(self, api):
        r = api.post(f"{BASE_URL}/api/feedback", json={"kind": "missing"}, timeout=10)
        assert r.status_code == 401

    def test_feedback_create_then_admin_list_and_patch(self, admin_headers):
        payload = {"kind": "missing_model", "manufacturer": "TEST_Brand",
                   "model": "TEST_Model", "firmware": "", "notes": "TEST_feedback"}
        r = requests.post(f"{BASE_URL}/api/feedback", json=payload, headers=admin_headers, timeout=10)
        assert r.status_code == 200
        fb_id = r.json()["id"]
        assert fb_id

        lst = requests.get(f"{BASE_URL}/api/admin/feedback", headers=admin_headers, timeout=10)
        assert lst.status_code == 200
        ids = [f["id"] for f in lst.json()]
        assert fb_id in ids

        p = requests.patch(f"{BASE_URL}/api/admin/feedback/{fb_id}",
                           json={"status": "resolved"}, headers=admin_headers, timeout=10)
        assert p.status_code == 200
        lst2 = requests.get(f"{BASE_URL}/api/admin/feedback", headers=admin_headers, timeout=10).json()
        got = next(f for f in lst2 if f["id"] == fb_id)
        assert got["status"] == "resolved"

    def test_admin_feedback_requires_admin(self, api):
        r = api.get(f"{BASE_URL}/api/admin/feedback", timeout=10)
        assert r.status_code == 401


# ----- Admin Catalog -----
class TestAdminCatalog:
    def test_admin_add_manufacturer_model_firmware(self, admin_headers):
        payload = {"manufacturer": "TEST_Vendor", "model": "TEST_Can 1",
                   "year": 2025, "type": "Over-ear ANC", "firmware": ["9.9.9"]}
        r = requests.post(f"{BASE_URL}/api/admin/catalog", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["manufacturer"] == "TEST_Vendor"
        assert d["model"] == "TEST_Can 1"
        assert "9.9.9" in d["added_firmware"]

        # add newer firmware -> should prepend
        r2 = requests.post(f"{BASE_URL}/api/admin/catalog",
                           json={"manufacturer": "TEST_Vendor", "model": "TEST_Can 1",
                                 "firmware": ["10.0.0"]},
                           headers=admin_headers, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["added_firmware"] == ["10.0.0"]

        cat = requests.get(f"{BASE_URL}/api/catalog", timeout=10).json()
        v = next((m for m in cat["manufacturers"] if m["name"] == "TEST_Vendor"), None)
        assert v, "vendor not in catalog"
        model = next(m for m in v["models"] if m["name"] == "TEST_Can 1")
        assert model["firmware"][0] == "10.0.0"

        # cleanup
        requests.delete(f"{BASE_URL}/api/admin/catalog/models/{model['id']}",
                        headers=admin_headers, timeout=10)

    def test_admin_catalog_requires_admin(self, api):
        r = api.post(f"{BASE_URL}/api/admin/catalog",
                     json={"manufacturer": "X"}, timeout=10)
        assert r.status_code == 401


# ----- Settings -----
class TestSettings:
    def test_get_settings(self, api):
        r = api.get(f"{BASE_URL}/api/settings", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "allow_user_keys" in d
        assert "default_model" in d
        assert isinstance(d["available_models"], list) and len(d["available_models"]) >= 1

    def test_put_settings_valid(self, admin_headers):
        # read current
        before = requests.get(f"{BASE_URL}/api/settings", timeout=10).json()
        payload = {"allow_user_keys": True, "default_provider": "openai", "default_model": "gpt-5.6-terra"}
        r = requests.put(f"{BASE_URL}/api/admin/settings", json=payload, headers=admin_headers, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["allow_user_keys"] is True
        # restore
        requests.put(f"{BASE_URL}/api/admin/settings",
                     json={"allow_user_keys": before.get("allow_user_keys", False),
                           "default_provider": before.get("default_provider", "openai"),
                           "default_model": before.get("default_model", "gpt-5.6-terra")},
                     headers=admin_headers, timeout=10)

    def test_put_settings_invalid_model(self, admin_headers):
        r = requests.put(f"{BASE_URL}/api/admin/settings",
                         json={"allow_user_keys": False, "default_provider": "openai",
                               "default_model": "nope-nope"},
                         headers=admin_headers, timeout=10)
        assert r.status_code == 400

    def test_put_settings_requires_admin(self, api):
        r = api.put(f"{BASE_URL}/api/admin/settings",
                    json={"allow_user_keys": False, "default_provider": "openai",
                          "default_model": "gpt-5.6-terra"}, timeout=10)
        assert r.status_code == 401


# ----- EQ Profiles -----
class TestEqProfiles:
    def test_profile_crud(self, admin_headers):
        payload = {
            "name": "TEST_Profile", "manufacturer": "Nothing", "model": "Headphone (1)",
            "firmware": "1.0.1.74", "band_count": 8,
            "bands": [{"freq": 60, "gain": 2.0, "q": 1.0, "reason": "sub bump"}] * 8,
            "song": {"title": "x", "artist": "y"}, "analysis": {},
        }
        r = requests.post(f"{BASE_URL}/api/eq/profiles", json=payload, headers=admin_headers, timeout=10)
        assert r.status_code == 200
        pid = r.json()["id"]

        lst = requests.get(f"{BASE_URL}/api/eq/profiles", headers=admin_headers, timeout=10).json()
        assert any(p["id"] == pid for p in lst)

        d = requests.delete(f"{BASE_URL}/api/eq/profiles/{pid}", headers=admin_headers, timeout=10)
        assert d.status_code == 200
        lst2 = requests.get(f"{BASE_URL}/api/eq/profiles", headers=admin_headers, timeout=10).json()
        assert not any(p["id"] == pid for p in lst2)

    def test_profiles_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/eq/profiles", timeout=10)
        assert r.status_code == 401
