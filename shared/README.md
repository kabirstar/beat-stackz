# @bpackz/shared

The API contract. Every route = zod schemas for params/query/body/response +
method, path, auth mode. Red implements `routes.*` exactly; Yellow consumes
them through the client (T003 adds MSW mocks generated from these).

Change requests go to Blue via `comms/<you>/<task>.md`. Do not edit here.
