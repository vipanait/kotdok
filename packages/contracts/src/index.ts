// Contracts shared by the web app and the Expo client.
//
// This package is the single source of the v1 request and response shapes:
// docs/api/openapi.yaml is generated from these schemas, so the two cannot
// drift apart. Nothing here may import Next.js, a server SDK or the DOM.
//
// The OpenAPI builder is not re-exported here: only the test that renders
// the document needs it, and through the barrel it reached both clients'
// bundles. It lives at `@lapka/contracts/openapi`.

export * from './version'
export * from './primitives'
export * from './errors'
export * from './profile'
export * from './consent'
export * from './pet'
export * from './health-targets'
export * from './medical-record'
export * from './vet-summary'
export * from './check'
export * from './followup'
export * from './credits'
export * from './analysis'
export * from './deletion'
