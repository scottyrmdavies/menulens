async function readScanResponse(response, onEvent) {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('ndjson')) {
    const payload = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, payload };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneEvent = null;
  let errorEvent = null;
  const take = (event) => {
    if (event.type === 'done') doneEvent = event;
    if (event.type === 'error') errorEvent = event;
    onEvent(event);
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) take(JSON.parse(line));
    }
  }
  if (buffer.trim()) take(JSON.parse(buffer));
  return {
    ok: Boolean(doneEvent),
    status: errorEvent?.status || response.status,
    payload: doneEvent || errorEvent,
  };
}

export { readScanResponse };
