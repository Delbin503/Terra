import { ConfirmDialog } from "@/components/ui";
import { SOURCE_LABEL } from "./scene-types";
import type { AssetType } from "./assets-data";

/**
 * BackdropReplaceDialog — asked on drop, when the scene already has a backdrop.
 *
 * A SCENE HAS ONE SKY. `SceneCanvas` takes the first environment it finds, or
 * the first skybox if there is no HDRI, and that one object decides the horizon
 * and the light landing on everything. A second one is not a second sky — it is
 * an inert object sitting in the layers tree looking exactly like the one that
 * is doing the work, with its own Sky Brightness and Sky Influence that change
 * nothing. People placed one, saw no change, and reasonably concluded the
 * controls were broken.
 *
 * So the second one asks. Replacing is almost always what was meant — you go
 * looking for a different sky because you want a different sky — which is why
 * it is the confirming action rather than the way out.
 *
 * BOTH BUTTONS ARE ANSWERS, as in `CameraPlaceDialog`: the left one keeps what
 * is already there and abandons the drop. Dismissing — Escape, the scrim, the
 * X — means the same thing, because the safe reading of "I closed the question"
 * is "leave my scene as it was".
 *
 * A GAUSSIAN SPLAT NEVER ASKS, even though the library files it under
 * Environments. A splat is a body in the world with a position you can move,
 * and two of them are two captured places standing side by side — both drawn,
 * both real. Nothing is being contested, so there is nothing to confirm.
 */
export function BackdropReplaceDialog({
  /** what is already in the scene */
  currentName,
  currentType,
  /** what was just dropped */
  incomingName,
  incomingType,
  onReplace,
  onKeep,
}: {
  currentName: string;
  currentType: AssetType;
  incomingName: string;
  incomingType: AssetType;
  onReplace: () => void;
  onKeep: () => void;
}) {
  // "a environment" is the kind of thing that makes a dialog read as unfinished.
  const withArticle = (t: AssetType) => {
    const word = SOURCE_LABEL[t].toLowerCase();
    return `${/^[aeiou]/.test(word) ? "an" : "a"} ${word}`;
  };
  const current = withArticle(currentType);
  const incoming = withArticle(incomingType);
  // Named separately because swapping like for like and swapping a skybox for
  // an HDRI are different-sized decisions: the second one also changes whether
  // the backdrop lights the scene at all.
  const sameKind = currentType === incomingType;

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onKeep()}
      tone="brand"
      title={`Replace ${currentName}?`}
      body={
        sameKind
          ? `Your scene already has ${current}. Only one is used, so ${incomingName} would sit unused alongside it.`
          : `Your scene already has ${current}, and ${incoming} takes over from it. Keeping both leaves ${currentName} in the scene doing nothing.`
      }
      cancelLabel={`Keep ${currentName}`}
      onCancel={onKeep}
      confirmLabel={`Replace with ${incomingName}`}
      confirmIcon="panorama"
      onConfirm={onReplace}
    />
  );
}
