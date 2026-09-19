import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("SYLLABUS_DB", str(tmp_path / "w.db"))
    monkeypatch.setenv("SYLLABUS_MEMORY_DIR", str(tmp_path / "m"))
    monkeypatch.setenv("OPENAI_API_KEY", "")
    from syllabusmind.web.student import app
    return TestClient(app)


def test_topics_and_page(client):
    assert client.get("/").status_code == 200
    assert {t["topic"] for t in client.get("/api/topics").json()["topics"]} >= {"dbms", "dsa"}


def test_answer_flow_and_edge_validation(client):
    v = client.post("/api/runs", json={"topic": "dbms"}).json()
    assert v["question"]["kind"] == "question"
    assert "correct" not in v["question"]                       # the key never reaches the page
    bad = client.post(f"/api/runs/{v['run_id']}/reply", json={"choice": "A", "confidence": "sure"})
    assert bad.status_code == 422
    ok = client.post(f"/api/runs/{v['run_id']}/reply", json={"choice": "A", "confidence": "certain"}).json()
    assert ok["answered"] == 1
    assert all(n["status"] == "unknown" for n in ok["nodes"] if n["n"] == 0)   # unknown, never zero


def test_no_open_question_is_a_clean_error(client):
    assert client.post("/api/runs/run_missing/reply", json={"flag": True}).status_code in (404, 409)


def test_full_run_reports_counts_and_caveats(client):
    v = client.post("/api/runs", json={"topic": "dsa"}).json()
    for _ in range(80):
        if v["state"] == "complete":
            break
        body = {"choose": "auto"} if v["question"]["kind"] == "choose" else {"choice": "A", "confidence": "guessing"}
        v = client.post(f"/api/runs/{v['run_id']}/reply", json=body).json()
    assert v["state"] == "complete"
    r = v["report"]
    assert isinstance(r["predictions_confirmed"], int) and r["caveats"]


def test_trust_table_choose_concept_and_explanations(client):
    v = client.post("/api/runs", json={"topic": "dbms"}).json()
    assert v["last"] is None
    for _ in range(60):
        if v["question"]["kind"] == "choose":
            break
        v = client.post(f"/api/runs/{v['run_id']}/reply", json={"choice": "A", "confidence": "certain"}).json()
        assert v["last"]["why"]                                   # every answered question is explained
    assert v["question"]["kind"] == "choose"
    assert len(v["question"]["candidates"]) == len(v["nodes"])     # any concept can be picked
    assert all({"status", "mastery", "trust", "weak_links"} <= set(n) for n in v["nodes"])
    v = client.post(f"/api/runs/{v['run_id']}/reply", json={"choose": "sql"}).json()
    assert v["question"]["kind"] == "question" and v["question"]["node_id"] == "sql"
