export type ThreatState = {
    status: "no_threat" | "threat" | "error";
    headline: string;
    predictedThreat: string;
    description: string;
    editedDescription: string;
    objects: { label: string; conf: number }[];
    cctvMeta: null | { cctvName: string; location: string; coverage: string };
    sso: { name: string; role: string; phone: string };
    confirmed: null | boolean;
    correctedThreat: string;
    timestamp: string;
    frames: string[]; // base64 urls or image urls
  };
  
  export function ThreatPanel({ state }: { state: ThreatState }) {
    return (
      <div className="panelCard">
        <div className="panelTitle">Incident Console</div>
        <div className={state.status === "threat" ? "panelHeadline danger" : "panelHeadline"}>
          {state.headline}
        </div>
  
        <div className="panelGrid">
          <div className="panelSection">
            <div className="panelSectionTitle">CCTV Information</div>
            <div className="kv">
              <div className="k">Camera</div>
              <div className="v">{state.cctvMeta?.cctvName ?? "—"}</div>
            </div>
            <div className="kv">
              <div className="k">Location</div>
              <div className="v">{state.cctvMeta?.location ?? "—"}</div>
            </div>
            <div className="kv">
              <div className="k">Coverage</div>
              <div className="v">{state.cctvMeta?.coverage ?? "—"}</div>
            </div>
          </div>
  
          <div className="panelSection">
            <div className="panelSectionTitle">AI Assessment</div>
            <div className="kv">
              <div className="k">Predicted threat</div>
              <div className="v">{state.predictedThreat || "—"}</div>
            </div>
            <div className="kv">
              <div className="k">Timestamp</div>
              <div className="v">{new Date(state.timestamp).toLocaleString()}</div>
            </div>
  
            <div className="panelTextareaLabel">AI description (editable)</div>
            <textarea className="panelTextarea" value={state.editedDescription} readOnly />
  
            <div className="panelSectionTitle" style={{ marginTop: 14 }}>Objects (YOLO context)</div>
            <div className="chips">
              {state.objects.length ? (
                state.objects.slice(0, 12).map((o, i) => (
                  <span key={i} className="chip">
                    {o.label} <span className="chipSub">{Math.round(o.conf * 100)}%</span>
                  </span>
                ))
              ) : (
                <span className="muted">—</span>
              )}
            </div>
          </div>
  
          <div className="panelSection">
            <div className="panelSectionTitle">SSO Confirmation</div>
            <div className="kv">
              <div className="k">Officer</div>
              <div className="v">{state.sso.name}</div>
            </div>
            <div className="kv">
              <div className="k">Role</div>
              <div className="v">{state.sso.role}</div>
            </div>
            <div className="kv">
              <div className="k">Contact</div>
              <div className="v">{state.sso.phone}</div>
            </div>
  
            <div className="panelNote">
              Confirmation + edits will be submitted with 3–4 frames for incident logging.
            </div>
  
            <div className="panelButtons">
              <button className="btnPrimary" disabled>Confirm & Send</button>
              <button className="btnGhost" disabled>Mark False Alarm</button>
            </div>
          </div>
        </div>
  
        <div className="panelSection" style={{ marginTop: 14 }}>
          <div className="panelSectionTitle">Frames (evidence)</div>
          <div className="frameRow">
            {state.frames?.length ? (
              state.frames.slice(0, 4).map((src, i) => (
                <img key={i} className="frameImg" src={src} alt={`frame-${i}`} />
              ))
            ) : (
              <div className="muted">No frames captured yet.</div>
            )}
          </div>
        </div>
      </div>
    );
  }