import { CircleDollarSign, MapPinned, Tag } from 'lucide-react'

const FEATURES = [
  {
    icon: Tag,
    title: 'Smart Ride Matching',
    description:
      'Our intelligent system connects you with people heading the same way.',
  },
  {
    icon: CircleDollarSign,
    title: 'Community-Driven',
    description:
      'Built to move communities forward — supports connection and accessibility.',
  },
  {
    icon: MapPinned,
    title: 'Modern Mobility',
    description: 'Designed with smart systems that handle the details.',
  },
] as const

export default function LandingFeatures() {
  return (
    <section className="border-t border-gray-100 bg-white py-14 sm:py-20">
      <div className="mx-auto w-full max-w-2xl px-4">
        <header className="text-center">
          <p className="text-sm font-semibold text-emerald-600">Sabay</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
            Smarter Ways to Get There
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-gray-500 sm:text-[15px]">
            Thoughtfully built features that make every trip efficient and easy.
          </p>
        </header>

        <ul className="mt-10 grid gap-5 sm:gap-6 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <li
              key={title}
              className="rounded-2xl bg-gray-50 p-5 sm:p-6 ring-1 ring-black/[0.04]"
            >
              <div
                className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-[0_0_0_8px_rgba(16,185,129,0.12)]"
                aria-hidden
              >
                <Icon size={22} strokeWidth={2} />
              </div>
              <h3 className="mt-4 text-base font-bold text-gray-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500">{description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
