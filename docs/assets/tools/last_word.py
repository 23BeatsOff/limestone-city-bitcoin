# Finds the 24th word of a BIP39 seed from your 23 words + 3 coin flips.
# Run it on an offline computer, next to the official english.txt word list.
import hashlib

words = open("english.txt").read().split()
mine = input("Your 23 words: ").lower().split()
flips = input("Flip a coin 3 times (heads = 1, tails = 0), e.g. 101: ").strip()

if len(mine) != 23 or len(flips) != 3 or set(flips) - {"0", "1"}:
    raise SystemExit("Need exactly 23 words and 3 flips of 0 or 1.")
for w in mine:
    if w not in words:
        raise SystemExit(f"'{w}' is not on the BIP39 list. Check your spelling.")

bits = "".join(format(words.index(w), "011b") for w in mine) + flips
entropy = int(bits, 2).to_bytes(32, "big")
checksum = format(hashlib.sha256(entropy).digest()[0], "08b")
print("Your 24th word is:", words[int(flips + checksum, 2)])
