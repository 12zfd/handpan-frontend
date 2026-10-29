export default function PanLogo({ size = 40 }) {
  const dots = [
    [50, 17, 'orange'],
    [79, 36, 'orange'],
    [79, 64, 'blue'],
    [50, 83, 'blue'],
    [21, 64, 'orange'],
    [21, 36, 'orange'],
  ]
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="#121821" stroke="#2A3646" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="30" fill="none" stroke="#1E2A3A" strokeWidth="1" />
      {dots.map(([x, y, c], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r="4.5"
          fill={c === 'blue' ? '#2563EB' : '#E8862A'}
        />
      ))}
      <circle cx="50" cy="50" r="6" fill="#E8862A" />
    </svg>
  )
}
