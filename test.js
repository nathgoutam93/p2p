import { access } from "fs";

access("./3001/test.txt", (err) => {
  if (err) {
    console.log(err);
  } else {
    console.log("has access");
  }
});
