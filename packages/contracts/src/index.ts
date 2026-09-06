// Contracts shared by the web app and the Expo client.
//
// This package is the single source of the v1 request and response shapes:
// docs/api/openapi.yaml is generated from these schemas, so the two cannot
// drift apart. Nothing here may import Next.js, a server SDK or the DOM.

/** Path prefix every mobile-facing route lives under. */
export const API_VERSION = 'v1' as const

export * from './primitives'
export * from './errors'
export * from './profile'
export * from './pet'
export * from './check'
export * from './credits'
