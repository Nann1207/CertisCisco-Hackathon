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