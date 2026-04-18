import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import { CCTVTile } from "../components/CCTVTile";
import type { TileState } from "../components/CCTVTile";
import { ThreatPanel } from "../components/ThreatPanel";
import type { ThreatState } from "../components/ThreatPanel";
import { uploadVideoForTile } from "../lib/api";

const TILE_IDS = ["cctv1", "cctv2", "cctv3", "cctv4"] as const;

export function DashboardPage() {
  const nav = useNavigate();
  const apiUrl = import.meta.env.VITE_API_URL as string;

  const [accessToken, setAccessToken] = useState<string>("");
  const [tiles, setTiles] = useState<Record<string, TileState>>({
    cctv1: { label: "CCTV 1", threat: false },
    cctv2: { label: "CCTV 2", threat: false },
    cctv3: { label: "CCTV 3", threat: false },
    cctv4: { label: "CCTV 4", threat: false },
  });

  const [threat, setThreat] = useState<ThreatState>({
    status: "no_threat",
    headline: "Currently all CCTV Cameras are detecting no threats.",
    predictedThreat: "",
    description: "",
    objects: [],
    cctvMeta: null,
    sso: { name: "—", role: "Senior Security Officer", phone: "—" },
    confirmed: null,
    correctedThreat: "",
    editedDescription: "",
    timestamp: new Date().toISOString(),
    frames: [],
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        nav("/");
        return;
      }
      setAccessToken(data.session.access_token);
    })();
  }, [nav]);

  const anyThreat = useMemo(() => Object.values(tiles).some((t) => t.threat), [tiles]);

  async function onLogout() {
    await supabase.auth.signOut();
    nav("/");
  }

  async function onDrop(tileId: string, file: File) {
    // local preview
    const url = URL.createObjectURL(file);
    setTiles((prev) => ({
      ...prev,
      [tileId]: { ...prev[tileId], file, previewUrl: url, loading: true, threat: false },
    }));

    // Call backend to run inference (stub will return demo data)
    try {
      const result = await uploadVideoForTile({ apiUrl, tileId, file, accessToken });

      const isThreat = Boolean(result?.threat_detected);
      const predicted = String(result?.predicted_threat ?? "");
      const desc = String(result?.ai_description ?? "");
      const objects = Array.isArray(result?.yolo_objects) ? result.yolo_objects : [];

      // update tile overlay
      setTiles((prev) => ({
        ...prev,
        [tileId]: { ...prev[tileId], loading: false, threat: isThreat, threatLabel: predicted },
      }));

      if (isThreat) {
        setThreat((prev) => ({
          ...prev,
          status: "threat",
          headline: `Threat detected in ${prev.cctvMeta?.cctvName ?? tileId.toUpperCase()}`,
          predictedThreat: predicted,
          description: desc,
          editedDescription: desc,
          objects,
          timestamp: new Date().toISOString(),
          frames: result?.frames ?? [],
          cctvMeta: result?.cctv_meta ?? prev.cctvMeta,
          confirmed: null,
          correctedThreat: "",
        }));
      } else {
        // if no threat for this tile, and no threats overall, reset panel
        const afterTiles = { ...tiles, [tileId]: { ...tiles[tileId], loading: false, threat: false } };
        const stillThreat = Object.values(afterTiles).some((t) => t.threat);
        if (!stillThreat) {
          setThreat((prev) => ({
            ...prev,
            status: "no_threat",
            headline: "Currently all CCTV Cameras are detecting no threats.",
            predictedThreat: "",
            description: "",
            editedDescription: "",
            objects: [],
            confirmed: null,
            correctedThreat: "",
            frames: [],
            timestamp: new Date().toISOString(),
          }));
        }
      }
    } catch (e: any) {
      setTiles((prev) => ({ ...prev, [tileId]: { ...prev[tileId], loading: false } }));
      setThreat((prev) => ({
        ...prev,
        status: "error",
        headline: "Inference failed. Please try again.",
        description: e?.message ?? String(e),
      }));
    }
  }

  function onClear() {
    // reset everything
    setTiles({
      cctv1: { label: "CCTV 1", threat: false },
      cctv2: { label: "CCTV 2", threat: false },
      cctv3: { label: "CCTV 3", threat: false },
      cctv4: { label: "CCTV 4", threat: false },
    });
    setThreat((prev) => ({
      ...prev,
      status: "no_threat",
      headline: "Currently all CCTV Cameras are detecting no threats.",
      predictedThreat: "",
      description: "",
      editedDescription: "",
      objects: [],
      confirmed: null,
      correctedThreat: "",
      frames: [],
      timestamp: new Date().toISOString(),
    }));
  }

  return (
    <div className="dashShell">
      <header className="dashTopbar">
        <div className="dashBrand">
          <div className="dashLogo">C</div>
          <div>
            <div className="dashTitle">Certic C2</div>
            <div className="dashSub">Command & Control Console</div>
          </div>
        </div>

        <div className="dashActions">
          <button className="btnGhost" onClick={onClear}>Clear</button>
          <button className="btnGhost" onClick={onLogout}>Sign out</button>
          <div className={anyThreat ? "statusPill statusDanger" : "statusPill statusOk"}>
            {anyThreat ? "THREAT" : "CLEAR"}
          </div>
        </div>
      </header>

      <main className="dashMain">
        <section className="gridPanel">
          <div className="grid2x2">
            {TILE_IDS.map((id) => (
              <CCTVTile
                key={id}
                id={id}
                state={tiles[id]}
                onDropFile={(f) => onDrop(id, f)}
              />
            ))}
          </div>

          <div className={anyThreat ? "banner bannerDanger" : "banner bannerOk"}>
            {anyThreat ? "Threat detected — awaiting confirmation." : "No threat detected."}
          </div>
        </section>

        <aside className="rightPanel">
          <ThreatPanel state={threat} />
        </aside>
      </main>
    </div>
  );
}
