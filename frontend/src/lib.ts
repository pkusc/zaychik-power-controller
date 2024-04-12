// fetchWithJson: A thin wrapper around fetch that
// sends a JSON and returns a JSON.
// Note that since GET requests do not have a body, `data` will be put to
// request params in URL
export async function fetchWithJson(url: string, method: string, data: any = {}): Promise<any> {
	const request_payload: any = {
		method: method,
		headers: {
		'Content-Type': 'application/json',
		},
		body: JSON.stringify(data)
	};
	if (method == 'GET') {
		delete request_payload.body;
		url += '?' + new URLSearchParams(data).toString();
	}
	const response = await fetch(url, request_payload);
	if (!response.ok) {
		throw new Error((await response.json()).message);
	}
	return await response.json();
}
