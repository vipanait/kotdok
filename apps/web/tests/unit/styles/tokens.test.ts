import { describe, expect, it } from 'vitest'
import { tokensCss } from '@lapka/shared'

// src/app/styles/tokens.css is rendered from the shared design tokens, so the
// site cannot show a colour the design spec (and the phone) does not have.
// Update it with:
//   npm run tokens:update --workspace @lapka/web
const STYLESHEET_PATH = '../../../src/app/styles/tokens.css'

describe('design tokens stylesheet', () => {
  it('matches the committed src/app/styles/tokens.css', async () => {
    await expect(tokensCss()).toMatchFileSnapshot(STYLESHEET_PATH)
  })
})
