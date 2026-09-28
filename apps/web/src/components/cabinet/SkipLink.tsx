'use client'

/**
 * «Перейти к содержимому»: focus goes to the page's main region, without the
 * `#main` history entry a plain fragment link adds. That entry sat on top of
 * a form's Back guard (its copy, same address), so Back landed on the copy
 * and «Уйти» after it went back onto the form (MW-09 final review). Without
 * JavaScript the link is a plain `#main` jump, as before.
 */
export default function SkipLink({ target, children }: { target: string; children: React.ReactNode }) {
  return (
    <a
      href={`#${target}`}
      className="skip-link"
      onClick={(e) => {
        const main = document.getElementById(target)
        if (!main) return
        e.preventDefault()
        // `main` has tabIndex -1: focus lands there and the page scrolls to it.
        main.focus()
      }}
    >
      {children}
    </a>
  )
}
