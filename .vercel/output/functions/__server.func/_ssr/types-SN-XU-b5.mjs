import { t as __exportAll } from "./rolldown-runtime-D8jQpDG7.mjs";
// node_modules/.nitro/vite/services/ssr/assets/types-SN-XU-b5.js
var types_exports = /* @__PURE__ */ __exportAll({
	CONNECTOR_TOKEN_HEADER: () => CONNECTOR_TOKEN_HEADER,
	CONNECTOR_TOKEN_PENDING_CODE: () => CONNECTOR_TOKEN_PENDING_CODE,
	CONNECTOR_TOKEN_READY_EVENT: () => CONNECTOR_TOKEN_READY_EVENT,
	ConnectorType: () => ConnectorType
});
var CONNECTOR_TOKEN_HEADER = "x-connector-access-token";
var CONNECTOR_TOKEN_PENDING_CODE = "connector_token_pending";
var CONNECTOR_TOKEN_READY_EVENT = "grok:connector-token-ready";
var ConnectorType = {
	GoogleDrive: "GoogleDrive",
	Gmail: "Gmail",
	GoogleCalendar: "GoogleCalendar",
	Outlook: "Outlook",
	OutlookCalendar: "OutlookCalendar",
	MicrosoftTeams: "MicrosoftTeams",
	Mcp: "Mcp"
};
export { types_exports as a, ConnectorType as i, CONNECTOR_TOKEN_PENDING_CODE as n, CONNECTOR_TOKEN_READY_EVENT as r };
