import { Kbd, Modal, Table, Text } from "@mantine/core";
import { ALT, MOD } from "./format";

export const SHORTCUTS: [string, string][] = [
  [`${MOD} B`, "Bold"],
  [`${MOD} I`, "Italic"],
  [`${MOD} ${ALT} 1`, "Heading"],
  [`${MOD} ${ALT} 2`, "Subheading"],
  [`${MOD} Shift Q`, "Quote"],
  [`${MOD} Shift L`, "List"],
  [`${MOD} Shift N`, "Plain text"],
  [`${ALT} ↑  ${ALT} ↓`, "Move this block up or down"],
  [`${MOD} Shift O`, "Outline: move whole sections"],
  [`${MOD} /`, "This panel"],
];

const TYPING: [string, string][] = [
  ["#", "heading"],
  ["##", "subheading"],
  [">", "quote"],
  ["-", "list"],
];

/** The key hints, kept out of the way until asked for. */
export function ShortcutsModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  return (
    <Modal opened={opened} onClose={onClose} title="Keyboard shortcuts" size="sm">
      <Table withRowBorders={false} verticalSpacing={4} fz="sm">
        <Table.Tbody>
          {SHORTCUTS.map(([keys, what]) => (
            <Table.Tr key={what}>
              <Table.Td style={{ whiteSpace: "nowrap" }}>
                {keys
                  .split(/\s{1,2}/)
                  .filter(Boolean)
                  .map((k, i) => (
                    <Kbd key={i} size="xs" mr={4}>
                      {k}
                    </Kbd>
                  ))}
              </Table.Td>
              <Table.Td c="dimmed">{what}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Text size="xs" c="dimmed" mt="sm">
        Or start a line with {TYPING.map(([k, w]) => `“${k}” for ${w}`).join(", ")}.
      </Text>
      <Text size="xs" c="dimmed" mt={6}>
        Pasting is switched off on purpose: the words here are yours.
      </Text>
    </Modal>
  );
}
