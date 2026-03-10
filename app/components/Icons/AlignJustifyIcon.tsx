type Props = {
    size?: number;
};

export function AlignJustifyIcon({ size = 24 }: Props) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
        >
            <rect x="3" y="5" width="18" height="2" rx="1" />
            <rect x="3" y="10" width="18" height="2" rx="1" />
            <rect x="3" y="15" width="18" height="2" rx="1" />
            <rect x="3" y="20" width="11" height="2" rx="1" />
        </svg>
    );
}
