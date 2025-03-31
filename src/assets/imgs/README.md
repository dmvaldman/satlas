Image compression
```
for f in bkg*.png; do convert "$f" -strip -quality 40 "${f%.png}.jpg"; done
```