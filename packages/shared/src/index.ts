// Portable helpers and dictionaries shared by both apps.
//
// This file is a barrel and nothing else: it re-exports, it never declares.
// A module that owns a value cannot be imported by its own siblings without
// closing a require cycle, which is what Metro warned about when the locale
// constants lived here and locale.ts reached back for them. Nothing here may
// import Next.js, a server SDK or anything from the DOM.

export * from './api-client'
export * from './datetime'
export * from './locale'
