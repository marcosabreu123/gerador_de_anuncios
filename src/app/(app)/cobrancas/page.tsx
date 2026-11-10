import { redirect } from "next/navigation";

// Cobranças virou a aba Clientes. O endereço antigo continua levando para lá.
export default function CobrancasPage() {
  redirect("/clientes");
}
