/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    pagination?: {
      page: number;
      limit: number;
      skip: number;
    };
  }
}
