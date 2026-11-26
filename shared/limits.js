// Vercel Hobby rejects a function request body over 4.5 MB at the edge
// (413 FUNCTION_PAYLOAD_TOO_LARGE) before this app's code runs. The 20 MB
// opt-in needs paid 4 GB function memory, so the free deploy stays under
// the default cap. These limits leave room for the JSON wrapper.

export const MAX_REQUEST_BYTES = 4 * 1024 * 1024;

// Checked by the scan API. Base64 plus the small JSON envelope stays under
// MAX_REQUEST_BYTES and under the 4.5 MB platform limit.
export const MAX_IMAGE_BASE64_CHARS = 3_500_000;

// The camera stops compressing once the photo is under this, leaving room
// for the preferences object in the same request.
export const CLIENT_MAX_IMAGE_BASE64_CHARS = 3_200_000;
