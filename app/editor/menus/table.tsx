import {
  AlignFullWidthIcon,
  DownloadIcon,
  TableColumnsDistributeIcon,
  TableIcon,
  TrashIcon,
} from "outline-icons";
import type { EditorState } from "prosemirror-state";
import { isNodeActive } from "@shared/editor/queries/isNodeActive";
import type { MenuItem } from "@shared/editor/types";
import { TableLayout, TableStyle } from "@shared/editor/types";
import type { Dictionary } from "~/hooks/useDictionary";

export default function tableMenuItems(
  state: EditorState,
  readOnly: boolean,
  dictionary: Dictionary
): MenuItem[] {
  if (readOnly) {
    return [];
  }
  const { schema } = state;

  const isFullWidth = isNodeActive(schema.nodes.table, {
    layout: TableLayout.fullWidth,
  })(state);

  const isApa7 = isNodeActive(schema.nodes.table, {
    style: TableStyle.apa7,
  })(state);

  return [
    {
      name: "setTableAttr",
      tooltip: isFullWidth
        ? dictionary.alignDefaultWidth
        : dictionary.alignFullWidth,
      icon: <AlignFullWidthIcon />,
      attrs: isFullWidth ? { layout: null } : { layout: TableLayout.fullWidth },
      active: () => isFullWidth,
    },
    {
      name: "setTableAttr",
      tooltip: isApa7
        ? dictionary.tableStyleDefault
        : dictionary.tableStyleApa7,
      icon: <TableIcon />,
      attrs: isApa7 ? { style: null } : { style: TableStyle.apa7 },
      active: () => isApa7,
    },
    {
      name: "distributeColumns",
      tooltip: dictionary.distributeColumns,
      icon: <TableColumnsDistributeIcon />,
    },
    {
      name: "separator",
    },
    {
      name: "deleteTable",
      tooltip: dictionary.deleteTable,
      icon: <TrashIcon />,
    },
    {
      name: "separator",
    },
    {
      name: "exportTable",
      tooltip: dictionary.exportAsCSV,
      label: "CSV",
      attrs: { format: "csv", fileName: `${window.document.title}.csv` },
      icon: <DownloadIcon />,
    },
  ];
}
