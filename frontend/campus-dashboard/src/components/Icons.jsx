const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function ThreeDotIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

export function DoubleArrowLeftIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M11 17l-5-5 5-5" />
      <path d="M18 17l-5-5 5-5" />
    </svg>
  );
}

export function DoubleArrowRightIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M13 17l5-5-5-5" />
      <path d="M6 17l5-5-5-5" />
    </svg>
  );
}

export function DashboardIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="9" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
      <rect x="3.5" y="15.5" width="7" height="5" rx="1.5" />
    </svg>
  );
}

export function RadioActiveIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.15" />
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
    </svg>
  );
}

export function UsersIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <path d="M16 5.4a3.2 3.2 0 0 1 0 5.2" />
      <path d="M17.5 14.8c1.7.7 2.8 2.2 3 4.7" />
    </svg>
  );
}

export function RoutinesIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 9.5V13l2.5 1.8" />
      <path d="M9 3.5h6" />
    </svg>
  );
}

export function IssueDeskIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M3.5 10.5 12 4.5l8.5 6" />
      <path d="M5.5 9.5V19a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9.5" />
      <path d="M10 20.5v-6h4v6" />
    </svg>
  );
}

export function RoomBookingIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M12 21s-6.5-5.2-6.5-10a6.5 6.5 0 0 1 13 0c0 4.8-6.5 10-6.5 10z" />
      <circle cx="12" cy="10.5" r="2.2" />
    </svg>
  );
}

export function GearIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
    </svg>
  );
}

export function RefreshIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.3 6" />
      <path d="M20 5v6h-6" />
    </svg>
  );
}

export function ArrowRightIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

export function CaretDownIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function UserIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.8-3.6 3.5-5.5 7-5.5s6.2 1.9 7 5.5" />
    </svg>
  );
}

export function HourglassIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M6.5 3.5h11" />
      <path d="M7 3.5v4.2a5 5 0 0 0 1.8 3.8L11 13.5l-2.2 2a5 5 0 0 0-1.8 3.8v1.2h10v-1.2a5 5 0 0 0-1.8-3.8L13 13.5l2.2-2a5 5 0 0 0 1.8-3.8V3.5" />
      <path d="M6.5 20.5h11" />
    </svg>
  );
}

export function GraduationIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M22 9 12 4 2 9l10 5 10-5z" />
      <path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" />
      <path d="M22 9v5" />
    </svg>
  );
}

export function TeacherIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="7.5" r="3.5" />
      <path d="M5.5 20c.6-3.4 3.2-5.2 6.5-5.2s5.9 1.8 6.5 5.2" />
      <path d="M17.5 4.2a3.5 3.5 0 0 1 0 6.6" />
    </svg>
  );
}

export function HomeIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9v10a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9" />
      <path d="M10 20.5v-5.5h4v5.5" />
    </svg>
  );
}

export function ChevronLeftIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function ChevronRightIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function LogoutIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M9 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H9" />
      <path d="M15 8l4 4-4 4" />
      <path d="M19 12H9" />
    </svg>
  );
}

export function AccountIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="10" r="2.6" />
      <path d="M6.8 18.2c.9-2.6 2.9-4 5.2-4s4.3 1.4 5.2 4" />
    </svg>
  );
}

export function EyeIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M4 4l16 16" />
      <path d="M9.9 5.9A9.6 9.6 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a15.4 15.4 0 0 1-2.6 3.2M6.6 6.6C3.9 8.4 2.5 12 2.5 12S6 18.5 12 18.5c1.3 0 2.5-.3 3.6-.9" />
      <path d="M10.6 10.6a3 3 0 0 0 4.1 4.1" />
    </svg>
  );
}

export function CameraIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

export function CircleCheckIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.2l2.4 2.4 4.6-5" />
    </svg>
  );
}

export function XIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function SearchIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </svg>
  );
}

export function CheckIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function BanIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6.5 6.5l11 11" />
    </svg>
  );
}

export function TrashIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M4.5 7h15" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5L17.5 7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function PencilIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z" />
      <path d="M14.5 6.5l3 3" />
    </svg>
  );
}

export function DownloadIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function PlusIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function ClockIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function BackArrowIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </svg>
  );
}

export function BuildingIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V21" />
      <path d="M14 9h4.5A1.5 1.5 0 0 1 20 10.5V21" />
      <path d="M2.5 21h19" />
      <path d="M7 8h4M7 12h4M7 16h4M16.5 13h.01M16.5 17h.01" />
    </svg>
  );
}

export function CalendarIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M8 3.5V7M16 3.5V7M3.5 10.5h17" />
    </svg>
  );
}

export function UndoIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

export function ArchiveIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M4 8h16" />
      <rect x="3.5" y="4.5" width="17" height="3.5" rx="1" />
      <path d="M5.5 8v10a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V8" />
      <path d="M10 12.5h4" />
    </svg>
  );
}

export function MegaphoneIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M3 11l18-6v12L3 13.5z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      <path d="M7 13.5V16" />
    </svg>
  );
}

export function PinIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M9.5 3h5l-1 4.5L17 11v1.8H7V11l3.5-3.5z" />
      <path d="M12 12.8V20" />
      <path d="M9 20h6" />
    </svg>
  );
}

export function PaperClipIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l8.6-8.6a4 4 0 1 1 5.7 5.7l-8.6 8.6a2 2 0 0 1-2.8-2.8l8.5-8.5" />
    </svg>
  );
}

export function UploadIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

export function BellIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M6 9.5a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10 19a2.2 2.2 0 0 0 4 0" />
    </svg>
  );
}

export function SunIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5 5l1.6 1.6M17.4 17.4 19 19M19 5l-1.6 1.6M6.6 17.4 5 19" />
    </svg>
  );
}

export function MoonIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  );
}

export function CalendarXIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M8 3.5V7M16 3.5V7M3.5 10.5h17" />
      <path d="M9.5 14.5l5 5M14.5 14.5l-5 5" />
    </svg>
  );
}

export function AlertOctagonIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M8.2 3.5h7.6L20.5 8.2v7.6l-4.7 4.7H8.2l-4.7-4.7V8.2z" />
      <path d="M12 8v4.5" />
      <path d="M12 16.2h.01" />
    </svg>
  );
}

export function SeatIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M7 12V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v5" />
      <path d="M5 12h14v3.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
      <path d="M7 17.5V21M17 17.5V21" />
    </svg>
  );
}

export function ChatIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.6 8.6 0 0 1-3.8-.9L3 20l1.2-4.6a8.2 8.2 0 0 1-1.2-4.4A8.4 8.4 0 0 1 11.5 2.8a8.4 8.4 0 0 1 9.5 8.7z" />
    </svg>
  );
}

export function SendIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M21 3 10.5 13.5" />
      <path d="M21 3 14 21l-3.5-7.5L3 10z" />
    </svg>
  );
}

export function MicIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3.5" />
    </svg>
  );
}

export function VolumeIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" />
      <path d="M15 9a4 4 0 0 1 0 6" />
      <path d="M17.5 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  );
}

export function ShieldIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

export function KeyIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.3 9.3" />
      <path d="m17 6 4-4" />
    </svg>
  );
}

export function StarIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export function MenuIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function MealIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M12 4.5c-4.7 0-8.5 3.8-8.5 8.5s3.8 8.5 8.5 8.5 8.5-3.8 8.5-8.5-3.8-8.5-8.5-8.5z" />
      <path d="M8 11.5V7a2 2 0 0 1 4 0v1" />
      <path d="M10 8v3.5" />
      <path d="M15 10v4.5a2 2 0 0 0 2 2" />
    </svg>
  );
}

export function BusIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" {...base} className={className} aria-hidden="true">
      <path d="M4 16V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10" />
      <path d="M4 16h16" />
      <path d="M4 16v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h10v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2" />
      <circle cx="7.5" cy="19.5" r="1.5" />
      <circle cx="16.5" cy="19.5" r="1.5" />
      <path d="M7.5 3v5M16.5 3v5" />
    </svg>
  );
}
