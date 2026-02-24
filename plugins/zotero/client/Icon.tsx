import * as React from "react";

/**
 * Zotero plugin icon – a stylised red "Z" matching the Zotero brand mark.
 */
export default function ZoteroIcon({
    size = 24,
    ...rest
}: React.SVGProps<SVGSVGElement> & { size?: number }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 100 100"
            width={size}
            height={size}
            aria-label="Zotero"
            {...rest}
        >
            <rect width="100" height="100" rx="8" fill="#CC2936" />
            <text
                x="50"
                y="74"
                fontSize="72"
                fontWeight="bold"
                fontFamily="Arial, sans-serif"
                textAnchor="middle"
                fill="#FFFFFF"
            >
                Z
            </text>
        </svg>
    );
}
