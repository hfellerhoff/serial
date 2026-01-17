"use client";

import dayjs from "dayjs";
import { useEffect, useState } from "react";

function getDate() {
  return dayjs().format("dddd, MMMM DD • hh:mma");
}

export function ClientDatetime() {
  const [dateString, setDateString] = useState(getDate());

  useEffect(() => {
    const interval = setInterval(() => {
      setDateString(getDate());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return dateString;
}
