import { http } from '../api';

// CSV exports used to be `window.location.href = '/api/export?…'`. That is a
// full page navigation, so a 422 (over the row cap) or a 401 (expired cookie)
// replaced the whole app with a raw JSON body and the user had to press Back.
// Fetching as a blob keeps failures inside the SPA where they can be a toast.
export async function downloadCsv(url, params, fallbackName = 'export.csv') {
  const res = await http.get(url, { params, responseType: 'blob' });

  let filename = fallbackName;
  const disposition = res.headers['content-disposition'] || '';
  const match = /filename="?([^";]+)"?/.exec(disposition);
  if (match) filename = match[1];

  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

// An error body arrives as a Blob when responseType is 'blob', so the usual
// err.response.data.error is a Blob rather than a string.
export async function csvErrorMessage(err, fallback) {
  try {
    const data = err?.response?.data;
    if (data instanceof Blob) return JSON.parse(await data.text()).error || fallback;
    return data?.error || fallback;
  } catch {
    return fallback;
  }
}
