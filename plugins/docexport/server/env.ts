import { IsOptional, IsUrl } from "class-validator";
import { Environment } from "@server/env";
import { Public } from "@server/utils/decorators/Public";
import environment from "@server/utils/environment";
import { CannotUseWithout } from "@server/utils/validators";

class DocExportPluginEnvironment extends Environment {
  /**
   * The URL of the external document conversion engine.
   * When set, Word and PDF export options will appear in the document menu.
   */
  @Public
  @IsOptional()
  @IsUrl({
    require_tld: false,
    require_protocol: true,
    allow_underscores: true,
    protocols: ["http", "https"],
  })
  public DOCEXPORT_ENGINE_URL = this.toOptionalString(
    environment.DOCEXPORT_ENGINE_URL
  );

  /**
   * Optional API key sent as a Bearer token to the conversion engine.
   */
  @IsOptional()
  @CannotUseWithout("DOCEXPORT_ENGINE_URL")
  public DOCEXPORT_ENGINE_API_KEY = this.toOptionalString(
    environment.DOCEXPORT_ENGINE_API_KEY
  );
}

export default new DocExportPluginEnvironment();
