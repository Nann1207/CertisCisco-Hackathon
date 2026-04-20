export async function uploadVideoForTile(params: {
    apiUrl: string;
    tileId: string;
    file: File;
    accessToken: string;
  }) {
    const { apiUrl, tileId, file, accessToken } = params;
  
    const form = new FormData();
    form.append("tile_id", tileId);
    form.append("file", file);
  
    const res = await fetch(`${apiUrl}/predict`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    });
  
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || `Upload failed (${res.status})`);
    }
    return res.json();
  }

export async function confirmIncident(params: {
  apiUrl: string;
  accessToken: string;
  incidentId?: string;
  tileId?: string;
  confirmed: boolean;
  predictedThreat?: string;
  cctvName?: string;
  locationName?: string;
  coverage?: string;
  frameUrls?: string[];
  yoloObjects?: Array<{ label: string; conf: number }>;
  supervisorId?: string | null;
  shiftId?: string | null;
  correctedThreat?: string;
  editedDescription?: string;
}) {
  const {
    apiUrl,
    accessToken,
    incidentId,
    tileId,
    confirmed,
    predictedThreat,
    cctvName,
    locationName,
    coverage,
    frameUrls,
    yoloObjects,
    supervisorId,
    shiftId,
    correctedThreat,
    editedDescription,
  } = params;

  const res = await fetch(`${apiUrl}/incident/confirm`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      incident_id: incidentId ?? null,
      tile_id: tileId,
      confirmed,
      predicted_threat: predictedThreat,
      cctv_name: cctvName,
      location_name: locationName,
      coverage,
      frame_urls: frameUrls ?? [],
      yolo_objects: yoloObjects ?? [],
      supervisor_id: supervisorId ?? null,
      shift_id: shiftId ?? null,
      corrected_threat: correctedThreat,
      edited_description: editedDescription,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `Incident confirmation failed (${res.status})`);
  }

  return res.json();
}
