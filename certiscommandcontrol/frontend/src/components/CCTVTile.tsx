import { useCallback, useRef, useState } from "react";

export type TileState = {
  label: string;
  previewUrl?: string;
  file?: File;
  loading?: boolean;
  threat: boolean;
  threatLabel?: string;
};

export function CCTVTile(props: {
  id: string;
  state: TileState;
  onDropFile: (file: File) => void;
}) {
  const { state, onDropFile } = props;
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onDropFile(f);
    },
    [onDropFile]
  );

  return (
    <div
      className={drag ? "tile tileDrag" : "tile"}
      onDragOver={(e) => (e.preventDefault(), setDrag(true))}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      <div className="tileHeader">
        <div className="tileLabel">{state.label}</div>
        <div className="tileRight">
          {state.loading && <span className="tileTag">Analyzing…</span>}
          {!state.loading && !state.previewUrl && <span className="tileTag">Drop video</span>}
          <button className="tileBtn" onClick={() => inputRef.current?.click()}>
            Upload
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onDropFile(f);
            }}
          />
        </div>
      </div>

      <div className="tileBody">
        {state.previewUrl ? (
          <video className="tileVideo" src={state.previewUrl} controls muted />
        ) : (
          <div className="tilePlaceholder">
            Drag & drop a CCTV clip here
            <div className="tileHint">MP4 / MOV supported</div>
          </div>
        )}

        {state.threat && (
          <div className="threatOverlay">
            <div className="threatOverlayText">
              THREAT
              {state.threatLabel ? <span className="threatOverlaySub">{state.threatLabel}</span> : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}