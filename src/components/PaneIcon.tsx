type PaneIconName = 'palette' | 'source' | 'preview'

type Props = {
  name: PaneIconName
}

export function PaneIcon({ name }: Props) {
  const paths = {
    palette: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    source: (
      <>
        <path d="m9 6-6 6 6 6" />
        <path d="m15 6 6 6-6 6" />
        <path d="m13 4-2 16" />
      </>
    ),
    preview: (
      <>
        <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
  }

  return (
    <svg className="pane__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  )
}
