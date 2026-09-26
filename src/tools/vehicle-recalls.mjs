import { z } from "zod";
import { compact, defineTool, ToolError } from "../kit/index.mjs";
import { decodeVin, nhtsaByVehicle } from "../sources.mjs";
import { READ_ONLY } from "./check-recalls.mjs";

const VIN = /^[A-HJ-NPR-Z0-9]{17}$/i;

export const vehicleRecalls = defineTool({
  name: "vehicle_recalls",
  title: "Vehicle recalls",
  description: "NHTSA safety recalls for a vehicle by VIN (decoded, with its check digit verified) or by make, model and year: campaign number, date, component, summary, consequence, remedy, and whether to park it or park outside. Recall campaigns apply to the model, not proof a given VIN is still unrepaired.",
  input: {
    vin: z.string().min(17).max(17).optional(),
    make: z.string().min(2).max(50).optional(),
    model: z.string().min(1).max(60).optional(),
    year: z.number().int().min(1950).max(2100).optional(),
  },
  output: { vehicle: z.looseObject({}), total: z.number(), recalls: z.array(z.looseObject({ campaign: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ vin, make, model, year }, ctx) => {
    let vehicle;
    if (vin) {
      if (!VIN.test(vin)) throw new ToolError("bad_vin", "A VIN has 17 letters and digits and never contains I, O or Q.");
      const d = await decodeVin(ctx, vin.toUpperCase());
      if (!d.decoded) throw new ToolError("vin_not_decoded", `NHTSA could not decode ${vin}.${d.note ? ` ${d.note}` : ""}`);
      vehicle = compact({ vin: vin.toUpperCase(), ...d });
    } else {
      if (!make || !model || !year) throw new ToolError("missing_vehicle", "Give a VIN, or make, model and year.");
      vehicle = { make, model, year: String(year) };
    }
    const recalls = await nhtsaByVehicle(ctx, vehicle);
    recalls.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { vehicle, total: recalls.length, recalls, ...compact({ urgent: recalls.filter((r) => r.park_it || r.park_outside).map((r) => r.campaign), note: recalls.length ? undefined : "NHTSA lists no recall campaign for this make, model and year." }) };
  },
});
