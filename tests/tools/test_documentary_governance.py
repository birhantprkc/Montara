from __future__ import annotations

from pathlib import Path

from tools.base_tool import ToolStatus
from tools.tool_registry import ToolRegistry
from tools.video.corpus_builder import CorpusBuilder
from tools.video.clip_search import ClipSearch
from tools.video.video_compose import VideoCompose


class _DummySource:
    def __init__(self, name: str, available: bool) -> None:
        self.name = name
        self._available = available

    def is_available(self) -> bool:
        return self._available

    def search(self, query: str, filters):  # pragma: no cover - protocol stub
        return []

    def download(self, candidate, out_path: Path):  # pragma: no cover - protocol stub
        return out_path


def test_corpus_builder_reports_source_level_discoverability(monkeypatch):
    import tools.video.stock_sources as stock_sources

    monkeypatch.setattr(
        stock_sources,
        "all_sources",
        lambda: [_DummySource("pexels", False), _DummySource("archive_org", True)],
    )
    monkeypatch.setattr(
        stock_sources,
        "available_sources",
        lambda: [_DummySource("archive_org", True)],
    )
    monkeypatch.setattr(
        stock_sources,
        "source_catalog",
        lambda: [
            {"name": "pexels", "status": "unavailable"},
            {"name": "archive_org", "status": "available"},
        ],
    )
    monkeypatch.setattr(
        stock_sources,
        "source_summary",
        lambda: {
            "configured": 1,
            "total": 2,
            "available_source_names": ["archive_org"],
            "unavailable_source_names": ["pexels"],
        },
    )

    tool = CorpusBuilder()
    assert tool.get_status() == ToolStatus.DEGRADED

    info = tool.get_info()
    assert info["source_provider_summary"]["configured"] == 1
    assert info["source_provider_summary"]["total"] == 2
    assert {entry["name"] for entry in info["source_provider_menu"]} == {
        "pexels",
        "archive_org",
    }


def test_corpus_builder_rejects_unavailable_pinned_sources(monkeypatch, tmp_path):
    import tools.video.stock_sources as stock_sources

    sources = {
        "pexels": _DummySource("pexels", False),
        "archive_org": _DummySource("archive_org", True),
    }

    monkeypatch.setattr(stock_sources, "all_sources", lambda: list(sources.values()))
    monkeypatch.setattr(
        stock_sources,
        "available_sources",
        lambda: [sources["archive_org"]],
    )
    monkeypatch.setattr(stock_sources, "get_source", lambda name: sources[name])
    monkeypatch.setattr(
        stock_sources,
        "source_summary",
        lambda: {
            "configured": 1,
            "total": 2,
            "available_source_names": ["archive_org"],
            "unavailable_source_names": ["pexels"],
        },
    )

    result = CorpusBuilder().execute({
        "corpus_dir": str(tmp_path / "corpus"),
        "queries": [{"query": "rain at night"}],
        "sources": ["pexels"],
    })

    assert not result.success
    assert "Requested stock sources are unavailable" in result.error
    assert "archive_org" in result.error


def test_documentary_renderer_family_maps_to_remotion():
    assert VideoCompose._get_composition_id("documentary-montage") == "CinematicRenderer"


def test_clip_search_fallback_ranks_local_fixture_corpus(monkeypatch, tmp_path):
    import lib.clip_embedder as clip_embedder
    from lib.corpus import ClipRecord, Corpus

    monkeypatch.setattr(clip_embedder, "_FALLBACK", True)
    monkeypatch.setattr(clip_embedder, "_FALLBACK_REASON", "test fallback")
    monkeypatch.setattr(clip_embedder, "_MODEL", None)
    monkeypatch.setattr(clip_embedder, "_PROCESSOR", None)

    corpus = Corpus(tmp_path / "corpus")
    vectors = clip_embedder.embed_texts([
        "oil tanker shipping through a narrow strait",
        "stock style strait b roll",
    ])
    corpus.add(
        ClipRecord(
            clip_id="local_fixture_01",
            source="local_fixture_stock",
            source_id="local_fixture_01",
            source_url="fixture://one",
            local_path="clips/one.mp4",
            query="oil tanker shipping through a narrow strait",
            motion_score=2.0,
        ),
        vectors[0],
        vectors[0],
    )
    corpus.add(
        ClipRecord(
            clip_id="local_fixture_02",
            source="local_fixture_stock",
            source_id="local_fixture_02",
            source_url="fixture://two",
            local_path="clips/two.mp4",
            query="stock style strait b roll",
            motion_score=2.0,
        ),
        vectors[1],
        vectors[1],
    )
    corpus.save()

    result = ClipSearch().execute({
        "operation": "rank_for_slot",
        "corpus_dir": str(tmp_path / "corpus"),
        "query_text": "oil tanker shipping through a narrow strait",
        "k": 2,
        "motion_min": 0.1,
    })

    assert result.success
    rows = result.data["results"]
    assert rows[0]["record"]["clip_id"] == "local_fixture_01"


def test_video_compose_surfaces_all_three_runtimes():
    """Preflight must see remotion, hyperframes, and ffmpeg as separate engines."""
    info = VideoCompose().get_info()
    engines = info["render_engines"]
    assert set(engines.keys()) == {"remotion", "hyperframes", "ffmpeg"}
    assert engines["ffmpeg"] is True  # always true on this machine
    assert "hyperframes_note" in info
    assert "runtime_governance" in info


def test_video_compose_blocks_silent_hyperframes_swap(tmp_path, monkeypatch):
    """Governance: if render_runtime='hyperframes' is locked but runtime
    is missing, the tool MUST return a structured blocker and NOT route to
    Remotion or FFmpeg."""
    monkeypatch.setattr(
        VideoCompose, "_hyperframes_available", lambda self: False, raising=True
    )
    result = VideoCompose().execute(
        {
            "operation": "render",
            "edit_decisions": {
                "version": "1.0",
                "renderer_family": "animation-first",
                "render_runtime": "hyperframes",
                "cuts": [
                    {"id": "c1", "source": "x", "in_seconds": 0, "out_seconds": 2}
                ],
            },
            "asset_manifest": {"assets": [{"id": "x", "path": "missing.png"}]},
            "output_path": str(tmp_path / "out.mp4"),
        }
    )
    assert not result.success
    err = (result.error or "").lower()
    assert "hyperframes" in err
    # Error MUST mention it's a blocker, not silently pick a different engine.
    assert ("blocker" in err) or ("not available" in err)


def test_video_compose_rejects_unknown_render_runtime(tmp_path):
    result = VideoCompose().execute(
        {
            "operation": "render",
            "edit_decisions": {
                "version": "1.0",
                "renderer_family": "explainer-data",
                "render_runtime": "bogus-runtime",
                "cuts": [
                    {"id": "c1", "source": "x", "in_seconds": 0, "out_seconds": 2}
                ],
            },
            "asset_manifest": {"assets": []},
            "output_path": str(tmp_path / "out.mp4"),
        }
    )
    assert not result.success
    assert "unknown render_runtime" in (result.error or "").lower()


def test_provider_menu_preserves_tool_discovery_metadata(monkeypatch):
    import tools.video.stock_sources as stock_sources

    monkeypatch.setattr(stock_sources, "all_sources", lambda: [_DummySource("archive_org", True)])
    monkeypatch.setattr(stock_sources, "available_sources", lambda: [_DummySource("archive_org", True)])
    monkeypatch.setattr(
        stock_sources,
        "source_catalog",
        lambda: [{"name": "archive_org", "status": "available"}],
    )
    monkeypatch.setattr(
        stock_sources,
        "source_summary",
        lambda: {
            "configured": 1,
            "total": 1,
            "available_source_names": ["archive_org"],
            "unavailable_source_names": [],
        },
    )

    registry = ToolRegistry()
    registry.register(CorpusBuilder())
    menu = registry.provider_menu()
    entry = menu["corpus_population"]["available"][0]

    assert entry["name"] == "corpus_builder"
    assert entry["source_provider_summary"]["configured"] == 1
    assert entry["source_provider_menu"][0]["name"] == "archive_org"
