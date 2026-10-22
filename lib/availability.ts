export function isKnownHttpStatus(status: number | null | undefined): status is number {
  return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599;
}

export function isSuccessfulHttpStatus(status: number | null | undefined) {
  return isKnownHttpStatus(status) && status >= 200 && status < 400;
}

export function isConfirmedHttpFailure(status: number | null | undefined) {
  return isKnownHttpStatus(status) && !isSuccessfulHttpStatus(status);
}
