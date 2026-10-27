/** Words as a writer would count them: letters and digits, with inner apostrophes and hyphens. */
export function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
}
