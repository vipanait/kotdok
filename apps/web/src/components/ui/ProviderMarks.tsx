/**
 * The sign-in providers' own marks, for the buttons under the auth forms.
 *
 * All three sit in the same 20×20 `.provider-mark` box and each is drawn to
 * fill it: the owner asked for the three icons to be exactly the same size.
 * Each viewBox is cropped to the glyph itself, so no mark carries padding the
 * others lack, and each SVG is 20 high.
 *
 * Sources and brand rules: docs/design/mobile-concept-v1/assets/provider-sources.md.
 */

const SIZE = 20

/** Yandex ID's round «Я», unchanged from `yandex-id.svg`; the circle is the whole viewBox. */
export function YandexMark() {
  return (
    <span className="provider-mark" aria-hidden="true">
      <svg width={SIZE} height={SIZE} viewBox="0 0 44 44" fill="none" focusable="false">
        <rect width="44" height="44" rx="22" fill="#FC3F1D" />
        <path
          d="M25.2438 12.3208H23.0173C19.2005 12.3208 17.292 14.2292 17.292 17.0919C17.292 20.2726 18.5643 21.863 21.427 23.7714L23.6535 25.3618L17.292 35.222H12.2029L18.2463 26.316C14.7475 23.7714 12.839 21.5449 12.839 17.41C12.839 12.3208 16.3378 8.82202 23.0173 8.82202H29.6969V35.222H25.2438V12.3208Z"
          fill="#fff"
        />
      </svg>
    </span>
  )
}

/** Google's full-colour G; its paths span the whole 18×18 viewBox. */
export function GoogleMark() {
  return (
    <span className="provider-mark" aria-hidden="true">
      <svg width={SIZE} height={SIZE} viewBox="0 0 18 18" fill="none" focusable="false">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
        <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
      </svg>
    </span>
  )
}

/**
 * Apple's mark from Apple Design Resources (`apple-logo-black.svg`), with the
 * viewBox tightened to the apple, which crops the padding Apple builds into
 * the file. The apple is taller than it is wide, so at the box's full 20px
 * height it is about 16px wide, centred. Apple's rules forbid the crop; the
 * owner chose on 17 September 2026 to match the other sign-in buttons, as in
 * the app.
 */
export function AppleMark() {
  return (
    <span className="provider-mark" aria-hidden="true">
      <svg width={SIZE} height={SIZE} viewBox="7.75 10.5 15.4609 19" focusable="false">
        <path
          d="M15.7099491,14.8846154 C16.5675461,14.8846154 17.642562,14.3048315 18.28274,13.5317864 C18.8625238,12.8312142 19.2852829,11.852829 19.2852829,10.8744437 C19.2852829,10.7415766 19.2732041,10.6087095 19.2490464,10.5 C18.2948188,10.5362365 17.1473299,11.140178 16.4588366,11.9494596 C15.9152893,12.56548 15.4200572,13.5317864 15.4200572,14.5222505 C15.4200572,14.6671964 15.4442149,14.8121424 15.4562937,14.8604577 C15.5166879,14.8725366 15.6133185,14.8846154 15.7099491,14.8846154 Z M12.6902416,29.5 C13.8618881,29.5 14.3812778,28.714876 15.8428163,28.714876 C17.3285124,28.714876 17.6546408,29.4758423 18.9591545,29.4758423 C20.2395105,29.4758423 21.0971074,28.292117 21.9063891,27.1325493 C22.8123013,25.8038779 23.1867451,24.4993643 23.2109027,24.4389701 C23.1263509,24.4148125 20.6743484,23.4122695 20.6743484,20.5979021 C20.6743484,18.1579784 22.6069612,17.0588048 22.7156707,16.974253 C21.4353147,15.1382708 19.490623,15.0899555 18.9591545,15.0899555 C17.5217737,15.0899555 16.3501271,15.9596313 15.6133185,15.9596313 C14.8161157,15.9596313 13.7652575,15.1382708 12.521138,15.1382708 C10.1536872,15.1382708 7.75,17.0950413 7.75,20.7911634 C7.75,23.0861411 8.64383344,25.513986 9.74300699,27.0842339 C10.6851558,28.4129053 11.5065162,29.5 12.6902416,29.5 Z"
          fill="#000000"
          fillRule="nonzero"
        />
      </svg>
    </span>
  )
}
